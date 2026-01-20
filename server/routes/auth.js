import { Router } from 'express';
import db from '../db/index.js';
import { getPlexAuthUrl, checkPlexPin, getPlexUser, getPlexFriends } from '../services/plex.js';
import { getSetting } from '../services/settings.js';

const router = Router();

const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'voterr';

const rateLimitMap = new Map();
const RATE_LIMIT = 5;
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
  
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests. Try again later.' });
  }
  
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 300000);

router.get('/plex', rateLimit, async (req, res) => {
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

    let user = db.prepare('SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE plex_id = ?').get(plexUser.id.toString());

    if (!user) {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      const isFirstUser = userCount.count === 0;
      
      if (!isFirstUser) {
        const adminToken = getSetting('plex_token');
        if (adminToken) {
          const friends = await getPlexFriends(adminToken);
          const isFriend = friends.some(f => f.id === plexUser.id.toString());
          
          if (!isFriend) {
            return res.status(403).json({ error: 'Access denied. You must be a Plex friend of the server owner.' });
          }
        }
      }
      
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

      user = db.prepare('SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE id = ?').get(result.lastInsertRowid);
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

  const user = db.prepare('SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE id = ?').get(req.session.userId);

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
