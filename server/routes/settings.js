import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getSetting, setSettings, getPlexToken } from '../services/settings.js';
import { getCacheStats, clearCache } from '../services/imageCache.js';
import { retryTautulli } from '../services/tautulli.js';
import { retryOverseerr } from '../services/overseerr.js';
import { clearPlexCache, getPlexServerAndLibrary } from './movies.js';

const router = Router();

router.get('/', requireAdmin, (req, res) => {
  res.json({
    overseerrUrl: getSetting('overseerr_url') || '',
    overseerrApiKey: getSetting('overseerr_api_key') || '',
    tautulliUrl: getSetting('tautulli_url') || '',
    tautulliApiKey: getSetting('tautulli_api_key') || '',
    tmdbApiKey: getSetting('tmdb_api_key') || '',
    cachePlexImages: getSetting('cache_plex_images') === 'true'
  });
});

router.post('/', requireAdmin, (req, res) => {
  const { overseerrUrl, overseerrApiKey, tautulliUrl, tautulliApiKey, tmdbApiKey, cachePlexImages } = req.body;

  const settings = {};
  if (overseerrUrl !== undefined) settings.overseerr_url = overseerrUrl || null;
  if (overseerrApiKey !== undefined) settings.overseerr_api_key = overseerrApiKey || null;
  if (tautulliUrl !== undefined) settings.tautulli_url = tautulliUrl || null;
  if (tautulliApiKey !== undefined) settings.tautulli_api_key = tautulliApiKey || null;
  if (tmdbApiKey !== undefined) settings.tmdb_api_key = tmdbApiKey || null;
  if (cachePlexImages !== undefined) settings.cache_plex_images = cachePlexImages ? 'true' : 'false';

  setSettings(settings);
  res.json({ success: true });
});

router.post('/test/overseerr', requireAdmin, async (req, res) => {
  const { url, apiKey } = req.body;

  if (!url || !apiKey) {
    return res.status(400).json({ error: 'URL and API key are required' });
  }

  try {
    const response = await fetch(`${url}/api/v1/status`, {
      headers: { 'X-Api-Key': apiKey }
    });

    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to connect. Check URL and API key.' });
    }

    const data = await response.json();
    res.json({ success: true, version: data.version });
  } catch (error) {
    res.status(400).json({ error: 'Failed to connect. Check URL.' });
  }
});

router.post('/test/tautulli', requireAdmin, async (req, res) => {
  const { url, apiKey } = req.body;

  if (!url || !apiKey) {
    return res.status(400).json({ error: 'URL and API key are required' });
  }

  try {
    const response = await fetch(`${url}/api/v2?apikey=${apiKey}&cmd=arnold`);

    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to connect. Check URL and API key.' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Failed to connect. Check URL.' });
  }
});

router.get('/cache/stats', requireAdmin, (req, res) => {
  res.json(getCacheStats());
});

router.delete('/cache/clear', requireAdmin, (req, res) => {
  const deleted = clearCache();
  res.json({ deleted });
});

router.post('/test/tmdb', requireAdmin, async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'API key is required' });
  }

  try {
    const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`);

    if (!response.ok) {
      return res.status(400).json({ error: 'Invalid API key' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Failed to connect to TMDB' });
  }
});

router.post('/retry/tautulli', requireAdmin, (req, res) => {
  retryTautulli();
  res.json({ success: true });
});

router.post('/retry/overseerr', requireAdmin, (req, res) => {
  retryOverseerr();
  res.json({ success: true });
});

router.post('/plex/clear-cache', requireAdmin, (req, res) => {
  clearPlexCache();
  res.json({ success: true });
});

router.get('/plex/info', requireAdmin, async (req, res) => {
  try {
    const plexToken = getPlexToken();
    
    if (!plexToken) {
      return res.json({ configured: false });
    }

    const { serverUrl, libraryKey, serverId } = await getPlexServerAndLibrary(plexToken);
    
    res.json({
      configured: true,
      serverUrl,
      libraryId: libraryKey,
      serverId
    });
  } catch (error) {
    console.error('Failed to get Plex info:', error);
    res.json({ configured: false, error: error.message });
  }
});

export default router;
