import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAdmin, requireAuth, requireAdminOrSetup } from '../middleware/auth.js';
import { getSetting, setSettings, getPlexToken } from '../services/settings.js';
import { getCacheStats, clearCache } from '../services/imageCache.js';
import { retryTautulli, getTautulliStatus, resetTautulliCircuit } from '../services/tautulli.js';
import {
  retryOverseerr,
  getOverseerrStatus,
  resetOverseerrCircuit,
} from '../services/overseerr.js';
import { clearPlexCache, getPlexServerAndLibrary } from './movies.js';
import { getBody } from '../types/index.js';

const router = Router();

router.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json({
    overseerrUrl: getSetting('overseerr_url') || '',
    overseerrApiKey: getSetting('overseerr_api_key') ? '••••••••' : '',
    tautulliUrl: getSetting('tautulli_url') || '',
    tautulliApiKey: getSetting('tautulli_api_key') ? '••••••••' : '',
    tmdbApiKey: getSetting('tmdb_api_key') ? '••••••••' : '',
    cachePlexImages: getSetting('cache_plex_images') === 'true',
  });
});

router.post('/', requireAdmin, (req: Request, res: Response) => {
  const {
    overseerrUrl,
    overseerrApiKey,
    tautulliUrl,
    tautulliApiKey,
    tmdbApiKey,
    cachePlexImages,
  } = getBody<Record<string, string | boolean | undefined>>(req);

  const settings: Record<string, string | null> = {};
  if (overseerrUrl !== undefined) settings.overseerr_url = (overseerrUrl as string) || null;
  if (overseerrApiKey !== undefined && overseerrApiKey !== '••••••••')
    settings.overseerr_api_key = (overseerrApiKey as string) || null;
  if (tautulliUrl !== undefined) settings.tautulli_url = (tautulliUrl as string) || null;
  if (tautulliApiKey !== undefined && tautulliApiKey !== '••••••••')
    settings.tautulli_api_key = (tautulliApiKey as string) || null;
  if (tmdbApiKey !== undefined && tmdbApiKey !== '••••••••')
    settings.tmdb_api_key = (tmdbApiKey as string) || null;
  if (cachePlexImages !== undefined)
    settings.cache_plex_images = cachePlexImages ? 'true' : 'false';

  setSettings(settings);
  res.json({ success: true });
});

router.post('/test/overseerr', requireAdminOrSetup, async (req: Request, res: Response) => {
  const { url, apiKey } = getBody<{ url?: string; apiKey?: string }>(req);

  if (!url || !apiKey) {
    res.status(400).json({ error: 'URL and API key are required' });
    return;
  }

  const effectiveApiKey = apiKey.startsWith('•') ? getSetting('overseerr_api_key') : apiKey;

  if (!effectiveApiKey) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  try {
    const response = await fetch(`${url}/api/v1/settings/main`, {
      headers: { 'X-Api-Key': effectiveApiKey },
    });

    if (!response.ok) {
      res.status(400).json({ error: 'Failed to connect. Check URL and API key.' });
      return;
    }

    const statusRes = await fetch(`${url}/api/v1/status`);
    const statusData = (await statusRes.json()) as { version?: string };

    resetOverseerrCircuit();
    res.json({ success: true, version: statusData.version });
  } catch {
    res.status(400).json({ error: 'Failed to connect. Check URL.' });
  }
});

router.post('/test/tautulli', requireAdminOrSetup, async (req: Request, res: Response) => {
  const { url, apiKey } = getBody<{ url?: string; apiKey?: string }>(req);

  if (!url || !apiKey) {
    res.status(400).json({ error: 'URL and API key are required' });
    return;
  }

  const effectiveApiKey = apiKey.startsWith('•') ? getSetting('tautulli_api_key') : apiKey;

  if (!effectiveApiKey) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  try {
    const response = await fetch(`${url}/api/v2?apikey=${effectiveApiKey}&cmd=arnold`);

    if (!response.ok) {
      res.status(400).json({ error: 'Failed to connect. Check URL and API key.' });
      return;
    }

    resetTautulliCircuit();
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Failed to connect. Check URL.' });
  }
});

router.get('/cache/stats', requireAdmin, (_req: Request, res: Response) => {
  res.json(getCacheStats());
});

router.delete('/cache/clear', requireAdmin, (_req: Request, res: Response) => {
  const deleted = clearCache();
  res.json({ deleted });
});

router.post('/test/tmdb', requireAdmin, async (req: Request, res: Response) => {
  const { apiKey } = getBody<{ apiKey?: string }>(req);

  if (!apiKey) {
    res.status(400).json({ error: 'API key is required' });
    return;
  }

  try {
    const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`);

    if (!response.ok) {
      res.status(400).json({ error: 'Invalid API key' });
      return;
    }

    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Failed to connect to TMDB' });
  }
});

router.post('/retry/tautulli', requireAdmin, async (_req: Request, res: Response) => {
  const result = await retryTautulli();
  res.json(result);
});

router.post('/retry/overseerr', requireAdmin, async (_req: Request, res: Response) => {
  const result = await retryOverseerr();
  res.json(result);
});

router.get('/services/status', requireAuth, (_req: Request, res: Response) => {
  res.json({
    overseerr: getOverseerrStatus(),
    tautulli: getTautulliStatus(),
  });
});

router.post('/reset/overseerr', requireAdmin, (_req: Request, res: Response) => {
  setSettings({
    overseerr_url: null,
    overseerr_api_key: null,
  });
  retryOverseerr();
  res.json({ success: true });
});

router.post('/reset/tautulli', requireAdmin, (_req: Request, res: Response) => {
  setSettings({
    tautulli_url: null,
    tautulli_api_key: null,
  });
  retryTautulli();
  res.json({ success: true });
});

router.post('/plex/clear-cache', requireAdmin, (_req: Request, res: Response) => {
  clearPlexCache();
  res.json({ success: true });
});

router.get('/plex/info', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const plexToken = getPlexToken();

    if (!plexToken) {
      res.json({ configured: false });
      return;
    }

    const { serverUrl, libraryKey, serverId } = await getPlexServerAndLibrary(plexToken);

    res.json({
      configured: true,
      serverUrl,
      libraryId: libraryKey,
      serverId,
    });
  } catch (err: unknown) {
    console.error('Failed to get Plex info:', err);
    res.json({
      configured: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

export default router;
