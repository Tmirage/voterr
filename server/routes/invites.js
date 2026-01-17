import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db/index.js';
import { requireAuth, requireNonGuest } from '../middleware/auth.js';
import { getProxiedImageUrl } from '../services/imageCache.js';

const router = Router();

router.post('/create', requireNonGuest, (req, res) => {
  const { movieNightId, expiresInHours } = req.body;

  if (!movieNightId) {
    return res.status(400).json({ error: 'movieNightId is required' });
  }

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

  const token = nanoid(16);
  
  let expiresAt = null;
  if (expiresInHours) {
    const expires = new Date();
    expires.setHours(expires.getHours() + expiresInHours);
    expiresAt = expires.toISOString();
  }

  db.prepare(`
    INSERT INTO guest_invites (token, movie_night_id, created_by, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, movieNightId, req.session.userId, expiresAt);

  res.json({
    token,
    url: `/join/${token}`,
    expiresAt
  });
});

router.get('/validate/:token', (req, res) => {
  const { token } = req.params;

  const invite = db.prepare(`
    SELECT gi.*, mn.date, mn.time, mn.status, g.name as group_name, g.description as group_description, g.image_url as group_image_url, g.max_votes_per_user
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.token = ?
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid invite link' });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite link has expired' });
  }

  const nightDateTime = new Date(`${invite.date}T${invite.time || '23:59'}:00`);
  if (nightDateTime < new Date()) {
    return res.status(410).json({ error: 'This movie night has already passed' });
  }

  if (invite.status !== 'voting') {
    return res.status(400).json({ error: 'Voting is closed for this movie night' });
  }

  const localUsers = db.prepare(`
    SELECT id, username, avatar_url FROM users WHERE is_local = 1
  `).all();

  const maxVotes = invite.max_votes_per_user || 3;
  const localUsersWithVotes = localUsers.map(u => {
    const userTotalVotes = db.prepare(`
      SELECT COALESCE(SUM(v.vote_count), 0) as total
      FROM votes v
      JOIN nominations n ON v.nomination_id = n.id
      WHERE n.movie_night_id = ? AND v.user_id = ?
    `).get(invite.movie_night_id, u.id);
    
    return {
      id: u.id,
      username: u.username,
      avatarUrl: u.avatar_url,
      votesRemaining: maxVotes - (userTotalVotes?.total || 0)
    };
  });

  const topNominations = db.prepare(`
    SELECT n.id, n.title, n.year, n.poster_url,
           COALESCE(SUM(v.vote_count), 0) as vote_count
    FROM nominations n
    LEFT JOIN votes v ON n.id = v.nomination_id
    WHERE n.movie_night_id = ?
    GROUP BY n.id
    ORDER BY vote_count DESC
    LIMIT 3
  `).all(invite.movie_night_id);

  res.json({
    valid: true,
    movieNightId: invite.movie_night_id,
    date: invite.date,
    time: invite.time,
    groupName: invite.group_name,
    groupDescription: invite.group_description,
    groupImageUrl: invite.group_image_url,
    maxVotesPerUser: maxVotes,
    localUsers: localUsersWithVotes,
    topNominations: topNominations.map(n => ({
      id: n.id,
      title: n.title,
      year: n.year,
      posterUrl: n.poster_url ? getProxiedImageUrl(n.poster_url) : null,
      voteCount: n.vote_count
    }))
  });
});

router.post('/local-join', (req, res) => {
  const { token, userId } = req.body;

  if (!token || !userId) {
    return res.status(400).json({ error: 'token and userId are required' });
  }

  const invite = db.prepare(`
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.token = ?
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid invite link' });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite link has expired' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_local = 1').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Local user not found' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(invite.group_id, userId);

  if (!isMember) {
    db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `).run(invite.group_id, userId);
  }

  req.session.userId = userId;
  req.session.isLocalInvite = true;
  req.session.localInviteMovieNightId = invite.movie_night_id;

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatar_url,
      isLocal: true,
      isLocalInvite: true,
      localInviteMovieNightId: invite.movie_night_id
    },
    movieNightId: invite.movie_night_id
  });
});

router.post('/plex-join', requireAuth, (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  const invite = db.prepare(`
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.token = ?
  `).get(token);

  if (!invite) {
    return res.status(404).json({ error: 'Invalid invite link' });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite link has expired' });
  }

  const isMember = db.prepare(
    'SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(invite.group_id, req.session.userId);

  if (!isMember) {
    db.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `).run(invite.group_id, req.session.userId);
  }

  res.json({
    success: true,
    movieNightId: invite.movie_night_id
  });
});

router.get('/movie-night/:movieNightId', requireNonGuest, (req, res) => {
  const { movieNightId } = req.params;

  const night = db.prepare('SELECT group_id FROM movie_nights WHERE id = ?').get(movieNightId);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  const isAdmin = db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(night.group_id, req.session.userId);

  if (!isAdmin) {
    return res.status(403).json({ error: 'Only admins can view invites' });
  }

  const invites = db.prepare(`
    SELECT gi.*, u.username as created_by_name
    FROM guest_invites gi
    LEFT JOIN users u ON gi.created_by = u.id
    WHERE gi.movie_night_id = ?
    ORDER BY gi.created_at DESC
  `).all(movieNightId);

  res.json(invites.map(i => ({
    id: i.id,
    token: i.token,
    url: `/join/${i.token}`,
    createdBy: i.created_by_name,
    expiresAt: i.expires_at,
    createdAt: i.created_at
  })));
});

router.delete('/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;

  const invite = db.prepare(`
    SELECT gi.*, mn.group_id
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    WHERE gi.id = ?
  `).get(id);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  const isAdmin = db.prepare(
    "SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ? AND role = 'admin'"
  ).get(invite.group_id, req.session.userId);

  const isCreator = invite.created_by === req.session.userId;

  if (!isAdmin && !isCreator) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM guest_invites WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
