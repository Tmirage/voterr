import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireNonGuest, requireNonGuestOrInvite, requireInviteMovieNight } from '../middleware/auth.js';
import { isMovieNightLocked } from '../utils/movieNight.js';
import { getAttendance } from '../utils/attendance.js';
import { buildWatchedCache, enrichNominations, sortAndMarkLeader } from '../utils/nominations.js';
import { hasUserWatchedMovie } from '../services/tautulli.js';
import { ensurePlexServerId } from './movies.js';
import { getPlexToken } from '../services/settings.js';
import { getPermissions, isGroupAdmin, isGroupMember } from '../utils/permissions.js';

const router = Router();

router.get('/movie-night/:movieNightId', requireInviteMovieNight, async (req, res) => {
  const { movieNightId } = req.params;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(movieNightId);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  if (!isGroupMember(req.session, night.group_id)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT max_votes_per_user FROM groups WHERE id = ?').get(night.group_id);
  const maxVotes = group?.max_votes_per_user;

  const nominations = db.prepare(`
    SELECT n.*, u.username as nominated_by_name
    FROM nominations n
    LEFT JOIN users u ON n.nominated_by = u.id
    WHERE n.movie_night_id = ?
    ORDER BY n.created_at
  `).all(movieNightId);

  const { attending: attendingUserIds, absent: absentUserIds } = getAttendance(movieNightId);

  const userTotalVotes = db.prepare(`
    SELECT COALESCE(SUM(v.vote_count), 0) as total
    FROM votes v
    JOIN nominations n ON v.nomination_id = n.id
    WHERE n.movie_night_id = ? AND v.user_id = ?
  `).get(movieNightId, req.session.userId);

  const groupMembers = db.prepare(`
    SELECT u.id, u.username, u.avatar_url, u.plex_id
    FROM users u
    JOIN group_members gm ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `).all(night.group_id);

  const memberVotingStatus = groupMembers.map(member => {
    const memberVotes = db.prepare(`
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `).get(movieNightId, member.id);
    
    return {
      id: member.id,
      username: member.username,
      avatarUrl: member.avatar_url,
      votesUsed: memberVotes?.total || 0,
      maxVotes: maxVotes,
      hasVoted: (memberVotes?.total || 0) > 0,
      votingComplete: (memberVotes?.total || 0) >= maxVotes
    };
  });

  const watchedCache = await buildWatchedCache(nominations, groupMembers);

  const nominationsWithVotes = await enrichNominations(nominations, {
    userId: req.session.userId,
    groupMembers,
    watchedCache,
    attendingUserIds,
    absentUserIds
  });

  const isLocked = isMovieNightLocked(night);
  const canVote = night.status === 'voting' && !isLocked;
  const canNominate = night.status === 'voting' && !isLocked;
  const permissions = getPermissions(req.session, night.group_id, night);

  const nominationsWithLeader = sortAndMarkLeader(nominationsWithVotes, night.winning_movie_id);

  const winner = night.winning_movie_id 
    ? nominationsWithVotes.find(n => n.id === night.winning_movie_id) || null
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
    plexServerId
  });
});

router.post('/nominate', requireNonGuestOrInvite, async (req, res) => {
  // Local invite users can only nominate in their invited movie night
  if (req.session.isLocalInvite && req.session.localInviteMovieNightId) {
    if (parseInt(req.body.movieNightId) !== req.session.localInviteMovieNightId) {
      return res.status(403).json({ error: 'Access limited to your invited movie night' });
    }
  }

  const { movieNightId, ratingKey, tmdbId, mediaType, title, year, posterUrl, overview, runtime } = req.body;

  if (!movieNightId || (!ratingKey && !tmdbId) || !title) {
    return res.status(400).json({ error: 'movieNightId, (ratingKey or tmdbId), and title are required' });
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(movieNightId);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  if (night.status !== 'voting') {
    return res.status(400).json({ error: 'Voting is closed for this movie night' });
  }

  if (isMovieNightLocked(night)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  if (!isGroupMember(req.session, night.group_id)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  let existing;
  if (ratingKey) {
    existing = db.prepare(
      'SELECT id FROM nominations WHERE movie_night_id = ? AND plex_rating_key = ?'
    ).get(movieNightId, ratingKey);
  }
  if (!existing && tmdbId) {
    existing = db.prepare(
      'SELECT id FROM nominations WHERE movie_night_id = ? AND tmdb_id = ?'
    ).get(movieNightId, tmdbId);
  }
  if (!existing && title && year) {
    existing = db.prepare(
      'SELECT id FROM nominations WHERE movie_night_id = ? AND LOWER(title) = LOWER(?) AND year = ?'
    ).get(movieNightId, title, year);
  }

  if (existing) {
    return res.status(400).json({ error: 'Movie already nominated' });
  }

  const result = db.prepare(`
    INSERT INTO nominations (movie_night_id, plex_rating_key, tmdb_id, media_type, title, year, poster_url, overview, runtime, nominated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(movieNightId, ratingKey || null, tmdbId || null, mediaType || 'plex', title, year, posterUrl, overview, runtime, req.session.userId);

  res.json({
    id: result.lastInsertRowid,
    ratingKey,
    title,
    year,
    posterUrl
  });
});

router.delete('/nominations/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;

  const nomination = db.prepare(`
    SELECT n.*, mn.group_id, mn.status
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(id);

  if (!nomination) {
    return res.status(404).json({ error: 'Nomination not found' });
  }

  if (nomination.status !== 'voting') {
    return res.status(400).json({ error: 'Cannot remove nominations after voting is closed' });
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(nomination.movie_night_id);
  if (night && isMovieNightLocked(night)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  const isNominator = nomination.nominated_by === req.session.userId;

  if (!isGroupAdmin(req.session, nomination.group_id) && !isNominator) {
    return res.status(403).json({ error: 'Only the nominator or an admin can remove this nomination' });
  }

  db.prepare('DELETE FROM votes WHERE nomination_id = ?').run(id);
  db.prepare('DELETE FROM nominations WHERE id = ?').run(id);
  res.json({ success: true });
});

router.post('/vote', requireAuth, async (req, res) => {
  // For local invite users, verify they can only vote on their movie night
  if (req.session.isLocalInvite && req.session.localInviteMovieNightId) {
    const nomination = db.prepare(`
      SELECT n.movie_night_id FROM nominations n WHERE n.id = ?
    `).get(req.body.nominationId);
    if (nomination && nomination.movie_night_id !== req.session.localInviteMovieNightId) {
      return res.status(403).json({ error: 'Access limited to your invited movie night' });
    }
  }

  const { nominationId } = req.body;

  if (!nominationId) {
    return res.status(400).json({ error: 'nominationId is required' });
  }

  const nomination = db.prepare(`
    SELECT n.*, mn.group_id, mn.status, mn.id as movie_night_id
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(nominationId);

  if (!nomination) {
    return res.status(404).json({ error: 'Nomination not found' });
  }

  if (nomination.status !== 'voting') {
    return res.status(400).json({ error: 'Voting is closed for this movie night' });
  }

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(nomination.movie_night_id);
  if (night && isMovieNightLocked(night)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  if (!isGroupMember(req.session, nomination.group_id)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT max_votes_per_user FROM groups WHERE id = ?').get(nomination.group_id);
  const maxVotes = group?.max_votes_per_user;

  const userTotalVotes = db.prepare(`
    SELECT COALESCE(SUM(v.vote_count), 0) as total
    FROM votes v
    JOIN nominations n ON v.nomination_id = n.id
    WHERE n.movie_night_id = ? AND v.user_id = ?
  `).get(nomination.movie_night_id, req.session.userId);

  if (userTotalVotes.total >= maxVotes) {
    return res.status(400).json({ error: 'You have used all your votes for this movie night' });
  }

  const isBlocked = db.prepare('SELECT 1 FROM nomination_blocks WHERE nomination_id = ?').get(nominationId);
  if (isBlocked) {
    return res.status(400).json({ error: 'This movie has been blocked' });
  }

  const user = db.prepare('SELECT plex_id FROM users WHERE id = ?').get(req.session.userId);
  let hasWatched = false;

  // Only check watch status for Plex movies
  if (user?.plex_id && nomination.plex_rating_key) {
    try {
      hasWatched = await hasUserWatchedMovie(user.plex_id, nomination.plex_rating_key, nomination.title);
    } catch (error) {
      console.error('Failed to check watch status:', error);
    }
  }

  db.prepare(`
    INSERT INTO votes (nomination_id, user_id, vote_count, has_watched)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(nomination_id, user_id) DO UPDATE SET vote_count = vote_count + 1, has_watched = ?
  `).run(nominationId, req.session.userId, hasWatched ? 1 : 0, hasWatched ? 1 : 0);

  res.json({ success: true, hasWatched });
});

router.delete('/vote/:nominationId', requireAuth, (req, res) => {
  // For local invite users, verify they can only unvote on their movie night
  if (req.session.isLocalInvite && req.session.localInviteMovieNightId) {
    const nomination = db.prepare(`
      SELECT n.movie_night_id FROM nominations n WHERE n.id = ?
    `).get(req.params.nominationId);
    if (nomination && nomination.movie_night_id !== req.session.localInviteMovieNightId) {
      return res.status(403).json({ error: 'Access limited to your invited movie night' });
    }
  }

  const { nominationId } = req.params;

  const nomination = db.prepare(`
    SELECT n.*, mn.status, mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(nominationId);

  if (!nomination) {
    return res.status(404).json({ error: 'Nomination not found' });
  }

  if (nomination.status !== 'voting') {
    return res.status(400).json({ error: 'Voting is closed for this movie night' });
  }

  if (isMovieNightLocked(nomination)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  const currentVote = db.prepare(
    'SELECT vote_count FROM votes WHERE nomination_id = ? AND user_id = ?'
  ).get(nominationId, req.session.userId);

  if (!currentVote || currentVote.vote_count <= 0) {
    return res.status(400).json({ error: 'No votes to remove' });
  }

  if (currentVote.vote_count === 1) {
    db.prepare('DELETE FROM votes WHERE nomination_id = ? AND user_id = ?')
      .run(nominationId, req.session.userId);
  } else {
    db.prepare('UPDATE votes SET vote_count = vote_count - 1 WHERE nomination_id = ? AND user_id = ?')
      .run(nominationId, req.session.userId);
  }

  res.json({ success: true });
});

router.post('/nomination/:nominationId/block', requireNonGuest, async (req, res) => {
  const { nominationId } = req.params;

  const nomination = db.prepare(`
    SELECT n.*, mn.group_id, mn.status, mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(nominationId);

  if (!nomination) {
    return res.status(404).json({ error: 'Nomination not found' });
  }

  if (nomination.status !== 'voting') {
    return res.status(400).json({ error: 'Voting is closed' });
  }

  if (isMovieNightLocked(nomination)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  const user = db.prepare('SELECT plex_id FROM users WHERE id = ?').get(req.session.userId);
  if (!user?.plex_id) {
    return res.status(400).json({ error: 'Cannot verify watch status' });
  }

  const hasWatched = await hasUserWatchedMovie(user.plex_id, nomination.plex_rating_key, nomination.title);
  if (!hasWatched) {
    return res.status(403).json({ error: 'You can only block movies you have watched' });
  }

  db.prepare(`
    INSERT OR IGNORE INTO nomination_blocks (nomination_id, user_id)
    VALUES (?, ?)
  `).run(nominationId, req.session.userId);

  db.prepare('DELETE FROM votes WHERE nomination_id = ?').run(nominationId);

  res.json({ success: true });
});

router.delete('/nomination/:nominationId/block', requireNonGuest, (req, res) => {
  const { nominationId } = req.params;

  const nomination = db.prepare(`
    SELECT mn.date, mn.time, mn.is_cancelled
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(nominationId);

  if (nomination && isMovieNightLocked(nomination)) {
    return res.status(400).json({ error: 'This movie night is locked' });
  }

  db.prepare('DELETE FROM nomination_blocks WHERE nomination_id = ? AND user_id = ?')
    .run(nominationId, req.session.userId);

  res.json({ success: true });
});

router.post('/movie-night/:id/decide', requireAuth, (req, res) => {
  const { id } = req.params;
  const { nominationId } = req.body;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const permissions = getPermissions(req.session, night.group_id, night);
  if (!permissions.canDecideWinner) {
    return res.status(403).json({ error: 'Only the host or admin can decide the winner' });
  }

  if (nominationId) {
    const nomination = db.prepare('SELECT id FROM nominations WHERE id = ? AND movie_night_id = ?')
      .get(nominationId, id);
    
    if (!nomination) {
      return res.status(400).json({ error: 'Invalid nomination' });
    }

    const isBlocked = db.prepare('SELECT 1 FROM nomination_blocks WHERE nomination_id = ?').get(nominationId);
    if (isBlocked) {
      return res.status(400).json({ error: 'Cannot pick a blocked movie as winner' });
    }

    db.prepare(`
      UPDATE movie_nights SET winning_movie_id = ?, status = 'decided' WHERE id = ?
    `).run(nominationId, id);
  } else {
    const { attending } = getAttendance(id);
    const attendingUserIds = [...attending];

    let winner;
    if (attendingUserIds.length > 0) {
      winner = db.prepare(`
        SELECT n.id, COUNT(v.id) as vote_count
        FROM nominations n
        LEFT JOIN votes v ON n.id = v.nomination_id AND v.user_id IN (${attendingUserIds.map(() => '?').join(',')})
        WHERE n.movie_night_id = ?
        GROUP BY n.id
        ORDER BY vote_count DESC
        LIMIT 1
      `).get(...attendingUserIds, id);
    } else {
      winner = db.prepare(`
        SELECT n.id, COUNT(v.id) as vote_count
        FROM nominations n
        LEFT JOIN votes v ON n.id = v.nomination_id
        WHERE n.movie_night_id = ?
        GROUP BY n.id
        ORDER BY vote_count DESC
        LIMIT 1
      `).get(id);
    }

    if (winner) {
      db.prepare(`
        UPDATE movie_nights SET winning_movie_id = ?, status = 'decided' WHERE id = ?
      `).run(winner.id, id);
    }
  }

  res.json({ success: true });
});

router.post('/movie-night/:id/undecide', requireAuth, (req, res) => {
  const { id } = req.params;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const permissions = getPermissions(req.session, night.group_id, night);
  if (!permissions.canDecideWinner) {
    return res.status(403).json({ error: 'Only the host or admin can undo the winner' });
  }

  db.prepare(`
    UPDATE movie_nights SET winning_movie_id = NULL, status = 'voting' WHERE id = ?
  `).run(id);

  res.json({ success: true });
});

export default router;
