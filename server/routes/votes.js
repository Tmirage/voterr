import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireNonGuest, requireNonGuestOrInvite, requireInviteMovieNight } from '../middleware/auth.js';
import { hasUserWatchedMovie, getTautulliStatus } from '../services/tautulli.js';
import { getProxiedImageUrl } from '../services/imageCache.js';

const router = Router();

function isMovieNightPast(date, time) {
  const nightDateTime = new Date(`${date}T${time || '23:59'}:00`);
  return nightDateTime < new Date();
}

router.get('/movie-night/:movieNightId', requireInviteMovieNight, async (req, res) => {
  const { movieNightId } = req.params;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(movieNightId);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(night.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT max_votes_per_user FROM groups WHERE id = ?').get(night.group_id);
  const maxVotes = group?.max_votes_per_user || 3;

  const nominations = db.prepare(`
    SELECT n.*, u.username as nominated_by_name
    FROM nominations n
    LEFT JOIN users u ON n.nominated_by = u.id
    WHERE n.movie_night_id = ?
    ORDER BY n.created_at
  `).all(movieNightId);

  const attendingUserIds = new Set(
    db.prepare(`
      SELECT user_id FROM attendance 
      WHERE movie_night_id = ? AND status = 'attending'
    `).all(movieNightId).map(a => a.user_id)
  );

  const absentUserIds = new Set(
    db.prepare(`
      SELECT user_id FROM attendance 
      WHERE movie_night_id = ? AND status = 'absent'
    `).all(movieNightId).map(a => a.user_id)
  );

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

  const watchedCache = new Map();
  const watchCheckPromises = [];
  
  for (const n of nominations) {
    for (const member of groupMembers) {
      if (member.plex_id && n.plex_rating_key) {
        const key = `${member.plex_id}-${n.plex_rating_key}`;
        if (!watchedCache.has(key)) {
          watchedCache.set(key, null);
          watchCheckPromises.push(
            hasUserWatchedMovie(member.plex_id, n.plex_rating_key, n.title)
              .then(watched => watchedCache.set(key, watched))
              .catch(() => watchedCache.set(key, false))
          );
        }
      }
    }
  }
  
  await Promise.all(watchCheckPromises);

  const nominationsWithVotes = nominations.map((n) => {
    const allVotes = db.prepare(`
      SELECT v.*, u.username, u.avatar_url
      FROM votes v
      JOIN users u ON v.user_id = u.id
      WHERE v.nomination_id = ?
    `).all(n.id);

    const votes = allVotes.filter(v => !absentUserIds.has(v.user_id) && (attendingUserIds.size === 0 || attendingUserIds.has(v.user_id)));
    const userVote = allVotes.find(v => v.user_id === req.session.userId);

    const watchedBy = [];
    for (const member of groupMembers) {
      if (member.plex_id && n.plex_rating_key) {
        const key = `${member.plex_id}-${n.plex_rating_key}`;
        if (watchedCache.get(key)) {
          watchedBy.push({ userId: member.id, username: member.username, avatarUrl: member.avatar_url });
        }
      }
    }

    const blocks = db.prepare(`
      SELECT nb.*, u.username, u.avatar_url
      FROM nomination_blocks nb
      JOIN users u ON nb.user_id = u.id
      WHERE nb.nomination_id = ?
    `).all(n.id);

    const userHasBlocked = blocks.some(b => b.user_id === req.session.userId);

    return {
      id: n.id,
      ratingKey: n.plex_rating_key,
      tmdbId: n.tmdb_id,
      mediaType: n.media_type || 'plex',
      title: n.title,
      year: n.year,
      posterUrl: n.poster_url ? getProxiedImageUrl(n.poster_url) : null,
      overview: n.overview,
      runtime: n.runtime,
      nominatedBy: {
        id: n.nominated_by,
        username: n.nominated_by_name
      },
      createdAt: n.created_at,
      votes: votes.map(v => ({
        userId: v.user_id,
        username: v.username,
        avatarUrl: v.avatar_url,
        voteCount: v.vote_count || 1
      })),
      voteCount: votes.reduce((sum, v) => sum + (v.vote_count || 1), 0),
      watchedBy,
      blockedBy: blocks.map(b => ({ userId: b.user_id, username: b.username, avatarUrl: b.avatar_url })),
      isBlocked: blocks.length > 0,
      userHasBlocked,
      userHasVoted: !!userVote,
      userVoteCount: userVote?.vote_count || 0
    };
  });

  const _serviceWarnings = [];
  const tautulliStatus = getTautulliStatus();
  if (tautulliStatus.configured && tautulliStatus.failed) {
    const msg = tautulliStatus.circuitOpen 
      ? `Tautulli disabled for ${tautulliStatus.remainingMinutes} min (${tautulliStatus.error})`
      : `Tautulli unavailable: ${tautulliStatus.error}`;
    _serviceWarnings.push({
      message: msg,
      type: 'warning',
      service: 'tautulli',
      circuitOpen: tautulliStatus.circuitOpen,
      remainingMinutes: tautulliStatus.remainingMinutes
    });
  }

  res.json({
    nominations: nominationsWithVotes,
    userRemainingVotes: maxVotes - (userTotalVotes?.total || 0),
    maxVotesPerUser: maxVotes,
    ...(_serviceWarnings.length > 0 && { _serviceWarnings })
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

  if (isMovieNightPast(night.date, night.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(night.group_id, req.session.userId);

  if (!isMember) {
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

  const night = db.prepare('SELECT date, time FROM movie_nights WHERE id = ?').get(nomination.movie_night_id);
  if (night && isMovieNightPast(night.date, night.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
  }

  const isNominator = nomination.nominated_by === req.session.userId;
  const isAdmin = db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(nomination.group_id, req.session.userId);

  if (!isAdmin && !isNominator) {
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

  const night = db.prepare('SELECT date, time FROM movie_nights WHERE id = ?').get(nomination.movie_night_id);
  if (night && isMovieNightPast(night.date, night.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(nomination.group_id, req.session.userId);

  if (!isMember) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const group = db.prepare('SELECT max_votes_per_user FROM groups WHERE id = ?').get(nomination.group_id);
  const maxVotes = group?.max_votes_per_user || 3;

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

  if (user?.plex_id) {
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
    SELECT n.*, mn.status, mn.date, mn.time
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

  if (isMovieNightPast(nomination.date, nomination.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
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
    SELECT n.*, mn.group_id, mn.status, mn.date, mn.time
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

  if (isMovieNightPast(nomination.date, nomination.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
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
    SELECT mn.date, mn.time
    FROM nominations n
    JOIN movie_nights mn ON n.movie_night_id = mn.id
    WHERE n.id = ?
  `).get(nominationId);

  if (nomination && isMovieNightPast(nomination.date, nomination.time)) {
    return res.status(400).json({ error: 'This movie night has already passed' });
  }

  db.prepare('DELETE FROM nomination_blocks WHERE nomination_id = ? AND user_id = ?')
    .run(nominationId, req.session.userId);

  res.json({ success: true });
});

router.post('/movie-night/:id/decide', requireNonGuest, (req, res) => {
  const { id } = req.params;
  const { nominationId } = req.body;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isHost = night.host_id === req.session.userId;
  const isAdmin = db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(night.group_id, req.session.userId);

  if (!isHost && !isAdmin) {
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
    const attendingUserIds = db.prepare(`
      SELECT user_id FROM attendance 
      WHERE movie_night_id = ? AND status = 'attending'
    `).all(id).map(a => a.user_id);

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

router.post('/movie-night/:id/undecide', requireNonGuest, (req, res) => {
  const { id } = req.params;

  const night = db.prepare('SELECT * FROM movie_nights WHERE id = ?').get(id);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isHost = night.host_id === req.session.userId;
  const isAdmin = db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(night.group_id, req.session.userId);

  if (!isHost && !isAdmin) {
    return res.status(403).json({ error: 'Only the host or admin can undo the winner' });
  }

  db.prepare(`
    UPDATE movie_nights SET winning_movie_id = NULL, status = 'voting' WHERE id = ?
  `).run(id);

  res.json({ success: true });
});

export default router;
