import { Router } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin, requireNonGuest } from '../middleware/auth.js';
import { getPlexFriends } from '../services/plex.js';

const router = Router();

router.get('/', requireNonGuest, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, avatar_url, is_local, is_admin, is_app_admin, created_at
    FROM users
    ORDER BY username
  `).all();

  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    avatarUrl: u.avatar_url,
    isLocal: u.is_local === 1,
    isAdmin: u.is_admin === 1,
    isAppAdmin: u.is_app_admin === 1,
    createdAt: u.created_at
  })));
});

router.get('/plex-friends', requireNonGuest, async (req, res) => {
  try {
    const user = db.prepare('SELECT plex_token FROM users WHERE id = ?').get(req.session.userId);
    
    if (!user?.plex_token) {
      return res.status(400).json({ error: 'No Plex token available' });
    }

    const friends = await getPlexFriends(user.plex_token);

    const existingPlexIds = new Set(
      db.prepare('SELECT plex_id FROM users WHERE plex_id IS NOT NULL').all().map(u => u.plex_id)
    );

    const availableFriends = friends
      .filter(f => !existingPlexIds.has(f.id.toString()))
      .map(f => ({
        plexId: f.id.toString(),
        username: f.username || f.title,
        email: f.email,
        avatarUrl: f.thumb
      }));

    res.json(availableFriends);
  } catch (error) {
    console.error('Failed to get Plex friends:', error);
    res.status(500).json({ error: 'Failed to get Plex friends' });
  }
});

router.post('/import-plex', requireNonGuest, (req, res) => {
  const { plexId, username, email, avatarUrl } = req.body;

  if (!plexId || !username) {
    return res.status(400).json({ error: 'plexId and username are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE plex_id = ?').get(plexId);
  if (existing) {
    return res.status(400).json({ error: 'User already imported' });
  }

  const result = db.prepare(`
    INSERT INTO users (plex_id, username, email, avatar_url, is_local)
    VALUES (?, ?, ?, ?, 0)
  `).run(plexId, username, email, avatarUrl);

  res.json({
    id: result.lastInsertRowid,
    username,
    email,
    avatarUrl,
    isLocal: false
  });
});

router.post('/local', requireNonGuest, (req, res) => {
  const { username, email } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND is_local = 1').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Local user with this username already exists' });
  }

  const result = db.prepare(`
    INSERT INTO users (username, email, is_local)
    VALUES (?, ?, 1)
  `).run(username, email);

  res.json({
    id: result.lastInsertRowid,
    username,
    email,
    isLocal: true
  });
});

router.patch('/:id/admin', requireAdmin, (req, res) => {
  const { id } = req.params;

  const targetUser = db.prepare('SELECT id, username, is_admin, is_local FROM users WHERE id = ?').get(id);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (targetUser.is_local) {
    return res.status(400).json({ error: 'Local users cannot be made admin' });
  }

  if (parseInt(id) === req.session.userId) {
    return res.status(400).json({ error: 'Cannot change your own admin status' });
  }

  const newAdminStatus = targetUser.is_admin === 1 ? 0 : 1;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(newAdminStatus, id);

  res.json({ success: true, isAdmin: newAdminStatus === 1 });
});

router.patch('/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const isSelf = parseInt(id) === req.session.userId;
  const isAppAdmin = req.session.isAppAdmin;

  if (!isSelf && !isAppAdmin) {
    return res.status(403).json({ error: 'You can only edit your own profile' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), id);
  res.json({ success: true, username: username.trim() });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.id === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
