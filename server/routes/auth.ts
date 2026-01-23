import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import db from '../db/index.js';
import { getPlexAuthUrl, checkPlexPin, getPlexUser, getPlexFriends } from '../services/plex.js';
import { getSetting } from '../services/settings.js';
import { logger } from '../services/logger.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface UserRow {
  id: number;
  plex_id: string | null;
  plex_token: string | null;
  username: string;
  email: string | null;
  avatar_url: string | null;
  is_admin: number;
  is_app_admin: number;
  is_local: number;
}

interface CountRow {
  count: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const router = Router();

const PLEX_CLIENT_ID = process.env.PLEX_CLIENT_ID || 'voterr';

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000;

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || 'unknown';
  const now = Date.now();

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    next();
    return;
  }

  const entry = rateLimitMap.get(ip)!;
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + RATE_WINDOW;
    next();
    return;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT) {
    logger.warn('auth', 'Rate limit exceeded', { ip }, req);
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((entry: RateLimitEntry, ip: string) => {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  });
}, 300000);

router.get('/plex', rateLimit, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    let forwardUrl: string | null = null;
    if (req.query.forwardUrl) {
      try {
        const url = new URL(String(req.query.forwardUrl));
        const origin = req.get('origin') || req.get('referer');
        if (origin) {
          const originUrl = new URL(origin);
          if (url.origin === originUrl.origin) {
            forwardUrl = String(req.query.forwardUrl);
          }
        }
      } catch {
        // Invalid URL, ignore
      }
    }
    const { pinId, code, authUrl } = await getPlexAuthUrl(PLEX_CLIENT_ID, forwardUrl);

    authReq.session.plexPinId = pinId;
    authReq.session.plexCode = code;

    res.json({ authUrl, pinId });
  } catch (err: unknown) {
    console.error('Plex auth error:', err);
    res.status(500).json({ error: 'Failed to initiate Plex authentication' });
  }
});

router.get('/plex/callback', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const pinId = authReq.session.plexPinId;

    if (!pinId) {
      res.status(400).json({ error: 'No pending authentication' });
      return;
    }

    const token = await checkPlexPin(pinId, PLEX_CLIENT_ID);

    if (!token) {
      res.json({ authenticated: false });
      return;
    }

    const plexUser = await getPlexUser(token);

    let user = db
      .prepare(
        'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE plex_id = ?'
      )
      .get(plexUser.id.toString()) as UserRow | undefined;

    if (!user) {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow;
      const isFirstUser = userCount.count === 0;

      if (!isFirstUser) {
        const adminToken = getSetting('plex_token');
        if (adminToken) {
          const friends = await getPlexFriends(adminToken);
          const isFriend = friends.some((f) => f.id === plexUser.id.toString());

          if (!isFriend) {
            logger.warn(
              'auth',
              'Access denied - not a Plex friend',
              { plexId: plexUser.id, username: plexUser.username },
              req
            );
            res
              .status(403)
              .json({ error: 'Access denied. You must be a Plex friend of the server owner.' });
            return;
          }
        }
      }

      const result = db
        .prepare(
          `
        INSERT INTO users (plex_id, plex_token, username, email, avatar_url, is_admin, is_app_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          plexUser.id.toString(),
          token,
          plexUser.username,
          plexUser.email,
          plexUser.thumb,
          isFirstUser ? 1 : 0,
          isFirstUser ? 1 : 0
        );

      user = db
        .prepare(
          'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE id = ?'
        )
        .get(result.lastInsertRowid) as UserRow;
    } else {
      db.prepare(
        `
        UPDATE users SET plex_token = ?, username = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(token, plexUser.username, plexUser.email, plexUser.thumb, user.id);
    }

    authReq.session.userId = user.id;
    authReq.session.isAdmin = user.is_admin === 1;
    authReq.session.isAppAdmin = user.is_app_admin === 1;

    authReq.session.plexPinId = undefined;
    authReq.session.plexCode = undefined;

    logger.info('auth', 'User logged in', { userId: user.id, username: user.username }, req);

    res.json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin: user.is_admin === 1,
        isAppAdmin: user.is_app_admin === 1,
      },
    });
  } catch (err: unknown) {
    console.error('Plex callback error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

router.get('/me', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.json({ authenticated: false });
    return;
  }

  const user = db
    .prepare(
      'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE id = ?'
    )
    .get(authReq.session.userId) as UserRow | undefined;

  if (!user) {
    authReq.session.destroy(() => {});
    res.json({ authenticated: false });
    return;
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
      isLocalInvite: authReq.session.isLocalInvite || false,
      localInviteMovieNightId: authReq.session.localInviteMovieNightId || null,
    },
  });
});

router.post('/plex', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { authToken } = getBody<{ authToken?: string }>(req);

    if (!authToken) {
      res.status(400).json({ error: 'Authentication token required' });
      return;
    }

    const plexUser = await getPlexUser(authToken);

    let user = db
      .prepare(
        'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE plex_id = ?'
      )
      .get(plexUser.id.toString()) as UserRow | undefined;

    if (!user) {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow;
      const isFirstUser = userCount.count === 0;

      if (!isFirstUser) {
        const adminToken = getSetting('plex_token');
        if (adminToken) {
          const friends = await getPlexFriends(adminToken);
          const isFriend = friends.some((f) => f.id === plexUser.id.toString());

          if (!isFriend) {
            logger.warn(
              'auth',
              'Access denied - not a Plex friend',
              { plexId: plexUser.id, username: plexUser.username },
              req
            );
            res
              .status(403)
              .json({ error: 'Access denied. You must be a Plex friend of the server owner.' });
            return;
          }
        }
      }

      const result = db
        .prepare(
          `
        INSERT INTO users (plex_id, plex_token, username, email, avatar_url, is_admin, is_app_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          plexUser.id.toString(),
          authToken,
          plexUser.username,
          plexUser.email,
          plexUser.thumb,
          isFirstUser ? 1 : 0,
          isFirstUser ? 1 : 0
        );

      user = db
        .prepare(
          'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin, is_local FROM users WHERE id = ?'
        )
        .get(result.lastInsertRowid) as UserRow;
    } else {
      db.prepare(
        `
        UPDATE users SET plex_token = ?, username = ?, email = ?, avatar_url = ?, updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(authToken, plexUser.username, plexUser.email, plexUser.thumb, user.id);
    }

    authReq.session.userId = user.id;
    authReq.session.isAdmin = user.is_admin === 1;
    authReq.session.isAppAdmin = user.is_app_admin === 1;

    logger.info('auth', 'User logged in', { userId: user.id, username: user.username }, req);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatar_url,
      isAdmin: user.is_admin === 1,
      isAppAdmin: user.is_app_admin === 1,
    });
  } catch (err: unknown) {
    console.error('Plex auth error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.session.userId;
  logger.info('auth', 'User logged out', { userId }, req);
  authReq.session.destroy(() => {});
  res.json({ success: true });
});

export default router;
