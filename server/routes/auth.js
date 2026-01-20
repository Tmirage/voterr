import { Router } from 'express';
import db from '../db/index.js';
import { getPlexAuthUrl, checkPlexPin, getPlexUser } from '../services/plex.js';

const router = Router();

const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'voterr';

router.get('/plex', async (req, res) => {
  try {
    const { pinId, code, authUrl } = await getPlexAuthUrl(PLEX_CLIENT_ID);
    
    req.session.plexPinId = pinId;
    req.session.plexCode = code;
    
    res.json({ authUrl, pinId });
  } catch (error) {
    console.error('Plex auth error:', error);
    res.status(500).json({ error: 'Failed to initiate Plex authentication' });
  }
});

router.get('/plex/callback', async (req, res) => {
  try {
    const pinId = req.session.plexPinId;
    
    if (!pinId) {
      return res.status(400).json({ error: 'No pending authentication' });
    }

    const token = await checkPlexPin(pinId, PLEX_CLIENT_ID);
    
    if (!token) {
      return res.json({ authenticated: false });
    }

    const plexUser = await getPlexUser(token);

    let user = db.prepare('SELECT * FROM users WHERE plex_id = ?').get(plexUser.id.toString());

    if (!user) {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const isFirstUser = userCount.count === 0;
      
      const result = db.prepare(`
        INSERT INTO users (plex_id, plex_token, username, email, avatar_url, is_admin, is_app_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        plexUser.id.toString(),
        token,
        plexUser.username,
        plexUser.email,
        plexUser.thumb,
        isFirstUser ? 1 : 0,
        isFirstUser ? 1 : 0
      );

      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else {
      db.prepare(`
        UPDATE users SET plex_token = ?, username = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(token, plexUser.username, plexUser.email, plexUser.thumb, user.id);
    }

    req.session.userId = user.id;
    req.session.isAdmin = user.is_admin === 1;
    req.session.isAppAdmin = user.is_app_admin === 1;
    
    delete req.session.plexPinId;
    delete req.session.plexCode;

    res.json({ 
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin: user.is_admin === 1,
        isAppAdmin: user.is_app_admin === 1
      }
    });
  } catch (error) {
    console.error('Plex callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ authenticated: false });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  if (!user) {
    req.session.destroy();
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1,
      isAppAdmin: user.is_app_admin === 1,
      isLocal: user.is_local === 1,
      isLocalInvite: req.session.isLocalInvite || false,
      localInviteMovieNightId: req.session.localInviteMovieNightId || null
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

export default router;
