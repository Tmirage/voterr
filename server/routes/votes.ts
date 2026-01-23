import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db/index.js';
import {
  requireAuth,
  requireNonGuest,
  requireNonGuestOrInvite,
  requireInviteMovieNight,
} from '../middleware/auth.js';
import { isMovieNightLocked } from '../utils/movieNight.js';
import { getAttendance } from '../utils/attendance.js';
import { buildWatchedCache, enrichNominations, sortAndMarkLeader } from '../utils/nominations.js';
import { hasUserWatchedMovie } from '../services/tautulli.js';
import { ensurePlexServerId } from './movies.js';
import { getPlexToken } from '../services/settings.js';
import { getPermissions, isGroupAdmin, isGroupMember } from '../utils/permissions.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface MovieNightRow {
  id: number;
  group_id: number;
  status: string;
  date: string;
  time: string;
  is_cancelled: number;
  winning_movie_id: number | null;
  host_id: number | null;
}

interface GroupRow {
  max_votes_per_user: number;
}

interface NominationRow {
  id: number;
  movie_night_id: number;
  plex_rating_key: string | null;
  tmdb_id: number | null;
  media_type: string;
  title: string;
  year: number | null;
  poster_url: string | null;
  overview: string | null;
  runtime: number | null;
  nominated_by: number;
  nominated_by_name: string;
  created_at: string;
  group_id?: number;
  status?: string;
}

interface VoteRow {
  total: number;
}

interface GroupMemberRow {
  id: number;
  username: string;
  avatar_url: string | null;
  plex_id: string | null;
}

interface UserRow {
  plex_id: string | null;
}

interface VoteCountRow {
  vote_count: number;
}

interface WinnerRow {
  id: number;
  vote_count: number;
}

const router = Router();

router.get(
  '/movie-night/:movieNightId',
  requireInviteMovieNight,
  async (req: Request, res: Response) => {
    const { movieNightId } = req.params;
    const authReq = req as AuthenticatedRequest;

    const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(movieNightId) as
      | MovieNightRow
      | undefined;
    if (!night) {
      res.status(404).json({ error: 'Movie night not found' });
      return;
    }

    if (!isGroupMember(authReq.session, night.group_id)) {
      res.status(403).json({ error: 'Not a member of this group' });
      return;
    }

    const group = db
      .prepare('SELECT max_votes_per_user FROM groups WHERE id = ?')
      .get(night.group_id) as GroupRow | undefined;
    const maxVotes = group?.max_votes_per_user ?? 3;

    const nominations = db
      .prepare(
        `
    SELECT n.*, u.username as nominated_by_name
    FROM nominations n
    LEFT JOIN users u ON n.nominated_by = u.id
    WHERE n.movie_night_id = ?
    ORDER BY n.created_at
  `
      )
      .all(movieNightId) as NominationRow[];

    const { attending: attendingUserIds, absent: absentUserIds } = getAttendance(
      parseInt(String(movieNightId))
    );

    const userTotalVotes = db
      .prepare(
        `
    SELECT COALESCE(SUM(v.vote_count), 0) as total
    FROM votes v
    JOIN nominations n ON v.nomination_id = n.id
    WHERE n.movie_night_id = ? AND v.user_id = ?
  `
      )
      .get(movieNightId, authReq.session.userId) as VoteRow;

    const groupMembers = db
      .prepare(
        `
    SELECT u.id, u.username, u.avatar_url, u.plex_id
    FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `
      )
      .all(night.group_id) as GroupMemberRow[];

    const memberVotingStatus = groupMembers.map((member) => {
      const memberVotes = db
        .prepare(
          `
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `
        )
        .get(movieNightId, member.id) as VoteRow;

      return {
        id: member.id,
        username: member.username,
        avatarUrl: member.avatar_url,
        votesUsed: memberVotes?.total || 0,
        maxVotes: maxVotes,
        hasVoted: (memberVotes?.total || 0) > 0,
        votingComplete: (memberVotes?.total || 0) >= maxVotes,
      };
    });

    const watchedCache = await buildWatchedCache(nominations, groupMembers);

    const nominationsWithVotes = await enrichNominations(nominations, {
      userId: authReq.session.userId!,
      groupMembers,
      watchedCache,
      attendingUserIds,
      absentUserIds,
    });

    const isLocked = isMovieNightLocked(night);
    const canVote = night.status === 'voting' && !isLocked;
    const canNominate = night.status === 'voting' && !isLocked;
    const permissions = getPermissions(authReq.session, night.group_id, night);

    const nominationsWithLeader = sortAndMarkLeader(nominationsWithVotes, night.winning_movie_id);

    const winner = night.winning_movie_id
      ? nominationsWithVotes.find((n) => n.id === night.winning_movie_id) || null
      : null;

    const attendingCount = attendingUserIds.size;
    const absentCount = absentUserIds.size;

    const plexServerId = await ensurePlexServerId(getPlexToken());

    res.json({
      nominations: nominationsWithLeader,
      userRemainingVotes: maxVotes - (userTotalVotes?.total || 0),
      maxVotesPerUser: maxVotes,
      isLocked,
      canVote,
      canNominate,
      canManage: permissions.canManage,
      canChangeHost: permissions.canChangeHost,
      canCancel: permissions.canCancel,
      winner,
      attendingCount,
      absentCount,
      memberVotingStatus,
      plexServerId,
    });
  }
);

router.post('/nominate', requireNonGuestOrInvite, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  const body = getBody<{
    movieNightId?: number;
    ratingKey?: string;
    tmdbId?: number;
    mediaType?: string;
    title?: string;
    year?: number;
    posterUrl?: string;
    overview?: string;
    runtime?: number;
  }>(req);

  if (authReq.session.isLocalInvite && authReq.session.localInviteMovieNightId) {
    if (body.movieNightId !== authReq.session.localInviteMovieNightId) {
      res.status(403).json({ error: 'Access limited to your invited movie night' });
      return;
    }
  }

  const { movieNightId, ratingKey, tmdbId, mediaType, title, year, posterUrl, overview, runtime } =
    body;

  if (!movieNightId || (!ratingKey && !tmdbId) || !title) {
    res.status(400).json({ error: 'movieNightId, (ratingKey or tmdbId), and title are required' });
    return;
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(movieNightId) as
    | MovieNightRow
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  if (night.status !== 'voting') {
    res.status(400).json({ error: 'Voting is closed for this movie night' });
    return;
  }

  if (isMovieNightLocked(night)) {
    res.status(400).json({ error: 'This movie night is locked' });
    return;
  }

  if (!isGroupMember(authReq.session, night.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  let existing: { id: number } | undefined;
  if (ratingKey) {
    existing = db
      .prepare('SELECT id FROM nominations WHERE movie_night_id = ? AND plex_rating_key = ?')
      .get(movieNightId, ratingKey) as { id: number } | undefined;
  }
  if (!existing && tmdbId) {
    existing = db
      .prepare('SELECT id FROM nominations WHERE movie_night_id = ? AND tmdb_id = ?')
      .get(movieNightId, tmdbId) as { id: number } | undefined;
  }
  if (!existing && title && year) {
    existing = db
      .prepare(
        'SELECT id FROM nominations WHERE movie_night_id = ? AND LOWER(title) = LOWER(?) AND year = ?'
      )
      .get(movieNightId, title, year) as { id: number } | undefined;
  }

  if (existing) {
    res.status(400).json({ error: 'Movie already nominated' });
    return;
  }

  const result = db
    .prepare(
      `
    INSERT INTO nominations (movie_night_id, plex_rating_key, tmdb_id, media_type, title, year, poster_url, overview, runtime, nominated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
    )
    .run(
      movieNightId,
      ratingKey || null,
      tmdbId || null,
      mediaType || 'plex',
      title,
      year,
      posterUrl,
      overview,
      runtime,
      authReq.session.userId
    );

  res.json({
    id: result.lastInsertRowid,
    ratingKey,
    title,
    year,
    posterUrl,
  });
});

router.delete('/nominations/:id', requireNonGuest, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const nomination = db
    .prepare(
      `
    SELECT n.*, mn.group_id, mn.status
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `
    )
    .get(id) as (NominationRow & { group_id: number; status: string }) | undefined;

  if (!nomination) {
    res.status(404).json({ error: 'Nomination not found' });
    return;
  }

  if (nomination.status !== 'voting') {
    res.status(400).json({ error: 'Cannot remove nominations after voting is closed' });
    return;
  }

  const night = db
    .prepare('SELECT * FROM movie_nights WHERE id = ?')
    .get(nomination.movie_night_id) as MovieNightRow | undefined;
  if (night && isMovieNightLocked(night)) {
    res.status(400).json({ error: 'This movie night is locked' });
    return;
  }

  const isNominator = nomination.nominated_by === authReq.session.userId;

  if (!isGroupAdmin(authReq.session, nomination.group_id) && !isNominator) {
    res.status(403).json({ error: 'Only the nominator or an admin can remove this nomination' });
    return;
  }

  db.prepare('DELETE FROM votes WHERE nomination_id = ?').run(id);
  db.prepare('DELETE FROM nominations WHERE id = ?').run(id);
  res.json({ success: true });
});

router.post('/vote', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  if (authReq.session.isLocalInvite && authReq.session.localInviteMovieNightId) {
    const nomination = db
      .prepare(
        `
      SELECT n.movie_night_id FROM nominations n WHERE n.id = ?
    `
      )
      .get(getBody<{ nominationId?: number }>(req).nominationId) as
      | { movie_night_id: number }
      | undefined;
    if (nomination && nomination.movie_night_id !== authReq.session.localInviteMovieNightId) {
      res.status(403).json({ error: 'Access limited to your invited movie night' });
      return;
    }
  }

  const { nominationId } = getBody<{ nominationId?: number }>(req);

  if (!nominationId) {
    res.status(400).json({ error: 'nominationId is required' });
    return;
  }

  const nomination = db
    .prepare(
      `
    SELECT n.*, mn.group_id, mn.status, mn.id as movie_night_id
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `
    )
    .get(nominationId) as (NominationRow & { group_id: number; status: string }) | undefined;

  if (!nomination) {
    res.status(404).json({ error: 'Nomination not found' });
    return;
  }

  if (nomination.status !== 'voting') {
    res.status(400).json({ error: 'Voting is closed for this movie night' });
    return;
  }

  const night = db
    .prepare('SELECT * FROM movie_nights WHERE id = ?')
    .get(nomination.movie_night_id) as MovieNightRow | undefined;
  if (night && isMovieNightLocked(night)) {
    res.status(400).json({ error: 'This movie night is locked' });
    return;
  }

  if (!isGroupMember(authReq.session, nomination.group_id)) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const group = db
    .prepare('SELECT max_votes_per_user FROM groups WHERE id = ?')
    .get(nomination.group_id) as GroupRow | undefined;
  const maxVotes = group?.max_votes_per_user ?? 3;

  const userTotalVotes = db
    .prepare(
      `
    SELECT COALESCE(SUM(v.vote_count), 0) as total
    FROM votes v
    JOIN nominations n ON v.nomination_id = n.id
    WHERE n.movie_night_id = ? AND v.user_id = ?
  `
    )
    .get(nomination.movie_night_id, authReq.session.userId) as VoteRow;

  if (userTotalVotes.total >= maxVotes) {
    res.status(400).json({ error: 'You have used all your votes for this movie night' });
    return;
  }

  const isBlocked = db
    .prepare('SELECT 1 FROM nomination_blocks WHERE nomination_id = ?')
    .get(nominationId);
  if (isBlocked) {
    res.status(400).json({ error: 'This movie has been blocked' });
    return;
  }

  const user = db.prepare('SELECT plex_id FROM users WHERE id = ?').get(authReq.session.userId) as
    | UserRow
    | undefined;
  let hasWatched = false;

  if (user?.plex_id && nomination.plex_rating_key) {
    try {
      hasWatched = await hasUserWatchedMovie(
        user.plex_id,
        nomination.plex_rating_key,
        nomination.title
      );
    } catch (err: unknown) {
      console.error('Failed to check watch status:', err);
    }
  }

  db.prepare(
    `
    INSERT INTO votes (nomination_id, user_id, vote_count, has_watched)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(nomination_id, user_id) DO UPDATE SET vote_count = vote_count + 1, has_watched = ?
  `
  ).run(nominationId, authReq.session.userId, hasWatched ? 1 : 0, hasWatched ? 1 : 0);

  res.json({ success: true, hasWatched });
});

router.delete('/vote/:nominationId', requireAuth, (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;

  if (authReq.session.isLocalInvite && authReq.session.localInviteMovieNightId) {
    const nomination = db
      .prepare(
        `
      SELECT n.movie_night_id FROM nominations n WHERE n.id = ?
    `
      )
      .get(req.params.nominationId) as { movie_night_id: number } | undefined;
    if (nomination && nomination.movie_night_id !== authReq.session.localInviteMovieNightId) {
      res.status(403).json({ error: 'Access limited to your invited movie night' });
      return;
    }
  }

  const { nominationId } = req.params;

  const nomination = db
    .prepare(
      `
    SELECT n.*, mn.status, mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `
    )
    .get(nominationId) as
    | (NominationRow & { status: string; date: string; time: string; is_cancelled: number })
    | undefined;

  if (!nomination) {
    res.status(404).json({ error: 'Nomination not found' });
    return;
  }

  if (nomination.status !== 'voting') {
    res.status(400).json({ error: 'Voting is closed for this movie night' });
    return;
  }

  if (
    isMovieNightLocked({
      date: nomination.date,
      time: nomination.time,
      is_cancelled: nomination.is_cancelled,
    })
  ) {
    res.status(400).json({ error: 'This movie night is locked' });
    return;
  }

  const currentVote = db
    .prepare('SELECT vote_count FROM votes WHERE nomination_id = ? AND user_id = ?')
    .get(nominationId, authReq.session.userId) as VoteCountRow | undefined;

  if (!currentVote || currentVote.vote_count <= 0) {
    res.status(400).json({ error: 'No votes to remove' });
    return;
  }

  if (currentVote.vote_count === 1) {
    db.prepare('DELETE FROM votes WHERE nomination_id = ? AND user_id = ?').run(
      nominationId,
      authReq.session.userId
    );
  } else {
    db.prepare(
      'UPDATE votes SET vote_count = vote_count - 1 WHERE nomination_id = ? AND user_id = ?'
    ).run(nominationId, authReq.session.userId);
  }

  res.json({ success: true });
});

router.post(
  '/nomination/:nominationId/block',
  requireNonGuest,
  async (req: Request, res: Response) => {
    const { nominationId } = req.params;
    const authReq = req as AuthenticatedRequest;

    const nomination = db
      .prepare(
        `
    SELECT n.*, mn.group_id, mn.status, mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `
      )
      .get(nominationId) as
      | (NominationRow & {
          group_id: number;
          status: string;
          date: string;
          time: string;
          is_cancelled: number;
        })
      | undefined;

    if (!nomination) {
      res.status(404).json({ error: 'Nomination not found' });
      return;
    }

    if (nomination.status !== 'voting') {
      res.status(400).json({ error: 'Voting is closed' });
      return;
    }

    if (
      isMovieNightLocked({
        date: nomination.date,
        time: nomination.time,
        is_cancelled: nomination.is_cancelled,
      })
    ) {
      res.status(400).json({ error: 'This movie night is locked' });
      return;
    }

    const user = db
      .prepare('SELECT plex_id FROM users WHERE id = ?')
      .get(authReq.session.userId) as UserRow | undefined;
    if (!user?.plex_id) {
      res.status(400).json({ error: 'Cannot verify watch status' });
      return;
    }

    const hasWatched = await hasUserWatchedMovie(
      user.plex_id,
      nomination.plex_rating_key,
      nomination.title
    );
    if (!hasWatched) {
      res.status(403).json({ error: 'You can only block movies you have watched' });
      return;
    }

    db.prepare(
      `
    INSERT OR IGNORE INTO nomination_blocks (nomination_id, user_id)
    VALUES (?, ?)
  `
    ).run(nominationId, authReq.session.userId);

    db.prepare('DELETE FROM votes WHERE nomination_id = ?').run(nominationId);

    res.json({ success: true });
  }
);

router.delete('/nomination/:nominationId/block', requireNonGuest, (req: Request, res: Response) => {
  const { nominationId } = req.params;
  const authReq = req as AuthenticatedRequest;

  const nomination = db
    .prepare(
      `
    SELECT mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `
    )
    .get(nominationId) as { date: string; time: string; is_cancelled: number } | undefined;

  if (nomination && isMovieNightLocked(nomination)) {
    res.status(400).json({ error: 'This movie night is locked' });
    return;
  }

  db.prepare('DELETE FROM nomination_blocks WHERE nomination_id = ? AND user_id = ?').run(
    nominationId,
    authReq.session.userId
  );

  res.json({ success: true });
});

router.post('/movie-night/:id/decide', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { nominationId } = getBody<{ nominationId?: number }>(req);
  const authReq = req as AuthenticatedRequest;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id) as
    | MovieNightRow
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  const permissions = getPermissions(authReq.session, night.group_id, night);
  if (!permissions.canDecideWinner) {
    res.status(403).json({ error: 'Only the host or admin can decide the winner' });
    return;
  }

  if (nominationId) {
    const nomination = db
      .prepare('SELECT id FROM nominations WHERE id = ? AND movie_night_id = ?')
      .get(nominationId, id);

    if (!nomination) {
      res.status(400).json({ error: 'Invalid nomination' });
      return;
    }

    const isBlocked = db
      .prepare('SELECT 1 FROM nomination_blocks WHERE nomination_id = ?')
      .get(nominationId);
    if (isBlocked) {
      res.status(400).json({ error: 'Cannot pick a blocked movie as winner' });
      return;
    }

    db.prepare(
      `
      UPDATE movie_nights SET winning_movie_id = ?, status = 'decided' WHERE id = ?
    `
    ).run(nominationId, id);
  } else {
    const { attending } = getAttendance(parseInt(String(id)));
    const attendingUserIds = [...attending];

    let winner: WinnerRow | undefined;
    if (attendingUserIds.length > 0) {
      winner = db
        .prepare(
          `
        SELECT n.id, COUNT(v.id) as vote_count
        FROM nominations n
        LEFT JOIN votes v ON n.id = v.nomination_id AND v.user_id IN (${attendingUserIds.map(() => '?').join(',')})
        WHERE n.movie_night_id = ?
        GROUP BY n.id
        ORDER BY vote_count DESC
        LIMIT 1
      `
        )
        .get(...attendingUserIds, id) as WinnerRow | undefined;
    } else {
      winner = db
        .prepare(
          `
        SELECT n.id, COUNT(v.id) as vote_count
        FROM nominations n
        LEFT JOIN votes v ON n.id = v.nomination_id
        WHERE n.movie_night_id = ?
        GROUP BY n.id
        ORDER BY vote_count DESC
        LIMIT 1
      `
        )
        .get(id) as WinnerRow | undefined;
    }

    if (winner) {
      db.prepare(
        `
        UPDATE movie_nights SET winning_movie_id = ?, status = 'decided' WHERE id = ?
      `
      ).run(winner.id, id);
    }
  }

  res.json({ success: true });
});

router.post('/movie-night/:id/undecide', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id) as
    | MovieNightRow
    | undefined;
  if (!night) {
    res.status(404).json({ error: 'Movie night not found' });
    return;
  }

  const permissions = getPermissions(authReq.session, night.group_id, night);
  if (!permissions.canDecideWinner) {
    res.status(403).json({ error: 'Only the host or admin can undo the winner' });
    return;
  }

  db.prepare(
    `
    UPDATE movie_nights SET winning_movie_id = NULL, status = 'voting' WHERE id = ?
  `
  ).run(id);

  res.json({ success: true });
});

export default router;
