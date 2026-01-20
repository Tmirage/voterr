import { Router } from 'express';
import { nanoid } from 'nanoid';
import db from '../db/index.js';
import { requireAuth, requireNonGuest } from '../middleware/auth.js';
import { getProxiedImageUrl } from '../services/imageCache.js';
import { isGroupMember, isGroupAdmin } from '../utils/permissions.js';

const router = Router();

// Rate limiting: 15 requests per minute per IP
const rateLimitMap = new Map();
const RATE_LIMIT = 15;
const RATE_WINDOW = 60000;

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return next();
  }
  
  const entry = rateLimitMap.get(ip);
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_WINDOW;
    return next();
  }
  
  if (entry.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  
  entry.count++;
  next();
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300000);

router.post('/create', requireNonGuest, (req, res) => {
  const { movieNightId, expiresInHours } = req.body;

  if (!movieNightId) {
    return res.status(400).json({ error: 'movieNightId is required' });
  }

  const night = db.prepare('SELECT mn.*, g.sharing_enabled FROM movie_nights mn JOIN groups g ON mn.group_id = g.id WHERE mn.id = ?').get(movieNightId);
  if (!night) {
    return res.status(404).json({ error: 'Movie night not found' });
  }

  if (!isGroupMember(req.session, night.group_id)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  if (night.sharing_enabled === 0) {
    return res.status(403).json({ error: 'Sharing is disabled for this group' });
  }

  // Check if there's already an active invite for this movie night
  const existingInvite = db.prepare(`
    SELECT * FROM guest_invites 
    WHERE movie_night_id = ? 
    AND (expires_at IS NULL OR expires_at > datetime('now'))
    ORDER BY created_at DESC
    LIMIT 1
  `).get(movieNightId);

  if (existingInvite) {
    return res.json({
      id: existingInvite.id,
      token: existingInvite.token,
      url: `/join/${existingInvite.token}`,
      expiresAt: existingInvite.expires_at
    });
  }

  const token = nanoid(32);
  
  let expiresAt = null;
  if (expiresInHours) {
    const expires = new Date();
    expires.setHours(expires.getHours() + expiresInHours);
    expiresAt = expires.toISOString();
  }

  const result = db.prepare(`
    INSERT INTO guest_invites (token, movie_night_id, created_by, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, movieNightId, req.session.userId, expiresAt);

  res.json({
    id: result.lastInsertRowid,
    token,
    url: `/join/${token}`,
    expiresAt
  });
});

// Refresh invite: invalidate old token and create new one
router.post('/refresh/:id', requireNonGuest, (req, res) => {
  const { id } = req.params;

  const invite = db.prepare(`
    SELECT gi.*, mn.group_id, g.sharing_enabled
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.id = ?
  `).get(id);

  if (!invite) {
    return res.status(404).json({ error: 'Invite not found' });
  }

  if (!isGroupAdmin(req.session, invite.group_id) && invite.created_by !== req.session.userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (invite.sharing_enabled === 0) {
    return res.status(403).json({ error: 'Sharing is disabled for this group' });
  }

  const newToken = nanoid(32);
  
  db.prepare('UPDATE guest_invites SET token = ? WHERE id = ?').run(newToken, id);

  res.json({
    id: invite.id,
    token: newToken,
    url: `/join/${newToken}`,
    expiresAt: invite.expires_at
  });
});

router.get('/validate/:token', rateLimit, (req, res) => {
  const { token } = req.params;

  const invite = db.prepare(`
    SELECT gi.*, mn.date, mn.time, mn.status, mn.is_cancelled, mn.cancel_reason, g.name as group_name, g.description as group_description, g.image_url as group_image_url, g.max_votes_per_user, g.sharing_enabled
    FROM guest_invites gi
    JOIN movie_nights mn ON gi.movie_night_id = mn.id
    JOIN groups g ON mn.group_id = g.id
    WHERE gi.token = ?
  `).get(token);

  if (invite && invite.sharing_enabled === 0) {
    return res.status(403).json({ error: 'Sharing is disabled for this group' });
  }

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

  const maxVotes = invite.max_votes_per_user;
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
    isCancelled: invite.is_cancelled === 1,
    cancelReason: invite.cancel_reason,
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

router.post('/local-join', rateLimit, (req, res) => {
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

  const user = db.prepare('SELECT id, username, avatar_url, is_local FROM users WHERE id = ? AND is_local = 1').get(userId);
  if (!user) {
    return res.status(404).json({ error: 'Local user not found' });
  }

  if (!isGroupMember({ userId }, invite.group_id)) {
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

  if (!isGroupMember(req.session, invite.group_id)) {
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

  if (!isGroupAdmin(req.session, night.group_id)) {
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

  const isCreator = invite.created_by === req.session.userId;

  if (!isGroupAdmin(req.session, invite.group_id) && !isCreator) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  db.prepare('DELETE FROM guest_invites WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
