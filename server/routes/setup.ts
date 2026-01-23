import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import db from '../db/index.js';
import { isSetupComplete, setSettings, getSafeSettings } from '../services/settings.js';
import { getPlexUser } from '../services/plex.js';
import { getBody, type AuthenticatedRequest } from '../types/index.js';

interface UserRow {
  id: number;
  plex_id: string | null;
  username: string;
  email: string | null;
  avatar_url: string | null;
  is_admin: number;
  is_app_admin: number;
}

interface CountRow {
  count: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface PlexPinResponse {
  authToken?: string;
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

router.get('/status', (_req: Request, res: Response) => {
  const complete = isSetupComplete();
  const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as CountRow).count;

  res.json({
    setupComplete: complete,
    hasUsers: userCount > 0,
  });
});

router.post('/plex-auth', rateLimit, async (req: Request, res: Response) => {
  if (isSetupComplete()) {
    res.status(403).json({ error: 'Setup already complete' });
    return;
  }

  try {
    const authReq = req as AuthenticatedRequest;
    const { authToken } = getBody<{ authToken?: string }>(req);

    if (!authToken) {
      res.status(400).json({ error: 'Authentication token required' });
      return;
    }

    const plexUser = await getPlexUser(authToken);

    authReq.session.setupPlexToken = authToken;
    authReq.session.setupPlexUser = {
      id: String(plexUser.id),
      username: plexUser.username,
      email: plexUser.email,
      thumb: plexUser.thumb || '',
    };

    res.json({
      user: {
        username: plexUser.username,
        email: plexUser.email,
        thumb: plexUser.thumb,
      },
    });
  } catch (err: unknown) {
    console.error('Setup Plex auth error:', err);
    res.status(500).json({ error: 'Failed to initiate Plex authentication' });
  }
});

router.get('/plex-auth/check', async (req: Request, res: Response) => {
  if (isSetupComplete()) {
    res.status(403).json({ error: 'Setup already complete' });
    return;
  }

  try {
    const authReq = req as AuthenticatedRequest;
    const pinId = authReq.session.setupPlexPinId;

    if (!pinId) {
      res.status(400).json({ error: 'No pending authentication' });
      return;
    }

    const response = await fetch(`https://plex.tv/api/v2/pins/${pinId}`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Client-Identifier': PLEX_CLIENT_ID,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to check Plex pin');
    }

    const data = (await response.json()) as PlexPinResponse;

    if (!data.authToken) {
      res.json({ authenticated: false });
      return;
    }

    const plexUser = await getPlexUser(data.authToken);

    authReq.session.setupPlexToken = data.authToken;
    authReq.session.setupPlexUser = {
      id: String(plexUser.id),
      username: plexUser.username,
      email: plexUser.email,
      thumb: plexUser.thumb || '',
    };

    res.json({
      authenticated: true,
      user: {
        username: plexUser.username,
        email: plexUser.email,
        thumb: plexUser.thumb,
      },
    });
  } catch (err: unknown) {
    console.error('Setup Plex check error:', err);
    res.status(500).json({ error: 'Failed to check authentication' });
  }
});

router.post('/complete', async (req: Request, res: Response) => {
  if (isSetupComplete()) {
    res.status(403).json({ error: 'Setup already complete' });
    return;
  }

  try {
    const authReq = req as AuthenticatedRequest;
    const { overseerrUrl, overseerrApiKey, tautulliUrl, tautulliApiKey } = getBody<{
      overseerrUrl?: string;
      overseerrApiKey?: string;
      tautulliUrl?: string;
      tautulliApiKey?: string;
    }>(req);
    const plexToken = authReq.session.setupPlexToken;
    const plexUser = authReq.session.setupPlexUser;

    if (!plexToken || !plexUser) {
      res.status(400).json({ error: 'Plex authentication required' });
      return;
    }

    if (overseerrUrl && overseerrApiKey) {
      try {
        const overseerrTest = await fetch(`${overseerrUrl}/api/v1/settings/main`, {
          headers: { 'X-Api-Key': overseerrApiKey },
        });
        if (!overseerrTest.ok) {
          res.status(400).json({ error: 'Failed to connect to Overseerr. Check URL and API key.' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Failed to connect to Overseerr. Check URL.' });
        return;
      }
    }

    if (tautulliUrl && tautulliApiKey) {
      try {
        const tautulliTest = await fetch(
          `${tautulliUrl}/api/v2?apikey=${tautulliApiKey}&cmd=arnold`
        );
        if (!tautulliTest.ok) {
          res.status(400).json({ error: 'Failed to connect to Tautulli. Check URL and API key.' });
          return;
        }
      } catch {
        res.status(400).json({ error: 'Failed to connect to Tautulli. Check URL.' });
        return;
      }
    }

    const settings: Record<string, string | null> = {
      plex_token: plexToken,
    };

    if (overseerrUrl) settings.overseerr_url = overseerrUrl;
    if (overseerrApiKey) settings.overseerr_api_key = overseerrApiKey;
    if (tautulliUrl) settings.tautulli_url = tautulliUrl;
    if (tautulliApiKey) settings.tautulli_api_key = tautulliApiKey;

    setSettings(settings);

    let user = db
      .prepare(
        'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin FROM users WHERE plex_id = ?'
      )
      .get(plexUser.id.toString()) as UserRow | undefined;

    if (!user) {
      const result = db
        .prepare(
          `
        INSERT INTO users (plex_id, plex_token, username, email, avatar_url, is_admin, is_app_admin)
        VALUES (?, ?, ?, ?, ?, 1, 1)
      `
        )
        .run(plexUser.id.toString(), plexToken, plexUser.username, plexUser.email, plexUser.thumb);

      user = db
        .prepare(
          'SELECT id, plex_id, username, email, avatar_url, is_admin, is_app_admin FROM users WHERE id = ?'
        )
        .get(result.lastInsertRowid) as UserRow;
    } else {
      db.prepare(
        `
        UPDATE users SET plex_token = ?, is_admin = 1, is_app_admin = 1, updated_at = datetime('now')
        WHERE id = ?
      `
      ).run(plexToken, user.id);
    }

    authReq.session.userId = user.id;
    authReq.session.isAdmin = true;
    authReq.session.isAppAdmin = true;

    authReq.session.setupPlexPinId = undefined;
    authReq.session.setupPlexCode = undefined;
    authReq.session.setupPlexToken = undefined;
    authReq.session.setupPlexUser = undefined;

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatar_url,
        isAdmin: true,
        isAppAdmin: true,
      },
    });
  } catch (err: unknown) {
    console.error('Setup complete error:', err);
    res.status(500).json({ error: 'Failed to complete setup' });
  }
});

router.get('/settings', (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(authReq.session.userId) as
    | { is_admin: number }
    | undefined;
  if (!user?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const settings = getSafeSettings();

  res.json({
    radarr_url: settings.radarr_url || '',
    radarr_api_key: settings.radarr_api_key || '',
    tautulli_url: settings.tautulli_url || '',
    tautulli_api_key: settings.tautulli_api_key || '',
    plex_configured: settings.plex_token === '••••••••',
  });
});

router.patch('/settings', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.session.userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(authReq.session.userId) as
    | { is_admin: number }
    | undefined;
  if (!user?.is_admin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const { radarrUrl, radarrApiKey, tautulliUrl, tautulliApiKey } = getBody<{
    radarrUrl?: string;
    radarrApiKey?: string;
    tautulliUrl?: string;
    tautulliApiKey?: string;
  }>(req);
  const updates: Record<string, string | null> = {};

  if (radarrUrl) updates.radarr_url = radarrUrl;
  if (radarrApiKey && radarrApiKey !== '••••••••') updates.radarr_api_key = radarrApiKey;
  if (tautulliUrl !== undefined) updates.tautulli_url = tautulliUrl || null;
  if (tautulliApiKey && tautulliApiKey !== '••••••••') updates.tautulli_api_key = tautulliApiKey;

  if (Object.keys(updates).length > 0) {
    setSettings(updates);
  }

  res.json({ success: true });
});

export default router;
