import { Router } from 'express';
import type { Request, Response } from 'express';
import db from '../db/index.js';
import { requireAuth, requireAdmin, requireNonGuest } from '../middleware/auth.js';
import { getPlexFriends } from '../services/plex.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface UserRow {
  id: number;
  plex_id?: string;
  plex_token?: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  is_local: number;
  is_admin: number;
  is_app_admin: number;
  created_at: string;
}

const router = Router();

router.get('/', requireNonGuest, (_req: Request, res: Response) => {
  const users = db
    .prepare(
      `
    SELECT id, username, email, avatar_url, is_local, is_admin, is_app_admin, created_at
    FROM users
    ORDER BY username
  `
    )
    .all() as UserRow[];

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      avatarUrl: u.avatar_url,
      isLocal: u.is_local === 1,
      isAdmin: u.is_admin === 1,
      isAppAdmin: u.is_app_admin === 1,
      createdAt: u.created_at,
    }))
  );
});

router.get('/plex-friends', requireNonGuest, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const user = db
      .prepare('SELECT plex_token FROM users WHERE id = ?')
      .get(authReq.session.userId) as UserRow | undefined;

    if (!user?.plex_token) {
      res.status(400).json({ error: 'No Plex token available' });
      return;
    }

    const friends = await getPlexFriends(user.plex_token);

    const existingPlexIds = new Set(
      (db.prepare('SELECT plex_id FROM users WHERE plex_id IS NOT NULL').all() as UserRow[]).map(
        (u) => u.plex_id
      )
    );

    const availableFriends = friends
      .filter((f) => !existingPlexIds.has(f.id.toString()))
      .map((f) => ({
        plexId: f.id.toString(),
        username: f.username,
        email: f.email,
        avatarUrl: f.thumb,
      }));

    res.json(availableFriends);
  } catch (err: unknown) {
    console.error('Failed to get Plex friends:', err);
    res.status(500).json({ error: 'Failed to get Plex friends' });
  }
});

router.post('/import-plex', requireNonGuest, (req: Request, res: Response) => {
  const { plexId, username, email, avatarUrl } = getBody<{
    plexId?: string;
    username?: string;
    email?: string;
    avatarUrl?: string;
  }>(req);

  if (!plexId || !username) {
    res.status(400).json({ error: 'plexId and username are required' });
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE plex_id = ?').get(plexId);
  if (existing) {
    res.status(400).json({ error: 'User already imported' });
    return;
  }

  const result = db
    .prepare(
      `
    INSERT INTO users (plex_id, username, email, avatar_url, is_local)
    VALUES (?, ?, ?, ?, 0)
  `
    )
    .run(plexId, username, email, avatarUrl);

  res.json({
    id: result.lastInsertRowid,
    username,
    email,
    avatarUrl,
    isLocal: false,
  });
});

router.post('/local', requireNonGuest, (req: Request, res: Response) => {
  const { username, email } = getBody<{ username?: string; email?: string }>(req);

  if (!username) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE username = ? AND is_local = 1')
    .get(username);
  if (existing) {
    res.status(400).json({ error: 'Local user with this username already exists' });
    return;
  }

  const result = db
    .prepare(
      `
    INSERT INTO users (username, email, is_local)
    VALUES (?, ?, 1)
  `
    )
    .run(username, email);

  res.json({
    id: result.lastInsertRowid,
    username,
    email,
    isLocal: true,
  });
});

router.patch('/:id/admin', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const targetUser = db
    .prepare('SELECT id, username, is_admin, is_local FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
  if (!targetUser) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (targetUser.is_local) {
    res.status(400).json({ error: 'Local users cannot be made admin' });
    return;
  }

  if (parseInt(String(id)) === authReq.session.userId) {
    res.status(400).json({ error: 'Cannot change your own admin status' });
    return;
  }

  const newAdminStatus = targetUser.is_admin === 1 ? 0 : 1;
  db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(newAdminStatus, id);

  res.json({ success: true, isAdmin: newAdminStatus === 1 });
});

router.patch('/:id', requireAuth, (req: Request, res: Response) => {
  const { id } = req.params;
  const { username, email } = getBody<{ username?: string; email?: string }>(req);
  const authReq = req as AuthenticatedRequest;

  const isSelf = parseInt(String(id)) === authReq.session.userId;
  const isAppAdmin = authReq.session.isAppAdmin;

  if (!isSelf && !isAppAdmin) {
    res.status(403).json({ error: 'You can only edit your own profile' });
    return;
  }

  const user = db.prepare('SELECT id, is_local FROM users WHERE id = ?').get(id) as
    | UserRow
    | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (!username || !username.trim()) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  if (user.is_local && email !== undefined) {
    db.prepare('UPDATE users SET username = ?, email = ? WHERE id = ?').run(
      username.trim(),
      email?.trim() || null,
      id
    );
    res.json({ success: true, username: username.trim(), email: email?.trim() || null });
  } else {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), id);
    res.json({ success: true, username: username.trim() });
  }
});

router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const authReq = req as AuthenticatedRequest;

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.id === authReq.session.userId) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

export default router;
