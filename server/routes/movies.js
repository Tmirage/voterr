import { Router } from 'express';
import db from '../db/index.js';
import { requireNonGuestOrInvite } from '../middleware/auth.js';
import { getPlexServers, getPlexLibraries, getPlexMovies, searchPlexMovies } from '../services/plex.js';
import { getPlexToken, getSetting } from '../services/settings.js';
import { searchOverseerrMovies, getOverseerrTrending, getOverseerrConfig, getOverseerrStatus } from '../services/overseerr.js';
import { searchMovies as searchTmdbMovies, isTmdbConfigured, validateTmdbApiKey } from '../services/tmdb.js';
import { getProxiedImageUrl } from '../services/imageCache.js';

const router = Router();

let cachedServerUrl = null;
let cachedMovieLibraryKey = null;

async function getPlexServerAndLibrary(plexToken) {
  if (cachedServerUrl && cachedMovieLibraryKey) {
    return { serverUrl: cachedServerUrl, libraryKey: cachedMovieLibraryKey };
  }

  const servers = await getPlexServers(plexToken);
  if (servers.length === 0) {
    throw new Error('No Plex servers found');
  }

  const server = servers[0];
  const connection = server.connections?.find(c => c.local === false) || server.connections?.[0];
  if (!connection) {
    throw new Error('No Plex server connection found');
  }

  cachedServerUrl = connection.uri;

  const libraries = await getPlexLibraries(cachedServerUrl, plexToken);
  const movieLibrary = libraries.find(lib => lib.type === 'movie');
  if (!movieLibrary) {
    throw new Error('No movie library found in Plex');
  }

  cachedMovieLibraryKey = movieLibrary.key;

  return { serverUrl: cachedServerUrl, libraryKey: cachedMovieLibraryKey };
}

router.get('/library', requireNonGuestOrInvite, async (req, res) => {
  try {
    const plexToken = getPlexToken();
    if (!plexToken) {
      return res.status(500).json({ error: 'Plex not configured' });
    }

    const { serverUrl, libraryKey } = await getPlexServerAndLibrary(plexToken);
    const movies = await getPlexMovies(serverUrl, libraryKey, plexToken);
    
    res.json(movies.map(m => ({
      ratingKey: m.ratingKey,
      title: m.title,
      year: m.year,
      overview: m.summary,
      runtime: m.duration,
      posterUrl: m.thumb
    })));
  } catch (error) {
    console.error('Failed to get library:', error);
    res.status(500).json({ error: 'Failed to get movie library' });
  }
});

router.get('/search', requireNonGuestOrInvite, async (req, res) => {
  const { q, source } = req.query;

  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Search query must be at least 2 characters' });
  }

  try {
    if (source === 'overseerr') {
      const movies = await searchOverseerrMovies(q);
      const _serviceWarnings = [];
      const overseerrStatus = getOverseerrStatus();
      if (overseerrStatus.configured && overseerrStatus.failed) {
        const msg = overseerrStatus.circuitOpen 
          ? `Overseerr disabled for ${overseerrStatus.remainingMinutes} min (${overseerrStatus.error})`
          : `Overseerr unavailable: ${overseerrStatus.error}`;
        _serviceWarnings.push({
          message: msg,
          type: 'warning',
          service: 'overseerr',
          circuitOpen: overseerrStatus.circuitOpen,
          remainingMinutes: overseerrStatus.remainingMinutes
        });
      }
      return res.json({ 
        results: movies.slice(0, 20),
        ...(_serviceWarnings.length > 0 && { _serviceWarnings })
      });
    }

    if (source === 'tmdb') {
      const movies = await searchTmdbMovies(q);
      return res.json(movies);
    }

    const plexToken = getPlexToken();
    if (!plexToken) {
      return res.status(500).json({ error: 'Plex not configured' });
    }

    const { serverUrl } = await getPlexServerAndLibrary(plexToken);
    const movies = await searchPlexMovies(serverUrl, q, plexToken);
    
    res.json(movies.slice(0, 20).map(m => ({
      ratingKey: m.ratingKey,
      title: m.title,
      year: m.year,
      overview: m.summary,
      runtime: m.duration,
      posterUrl: m.thumb,
      mediaType: 'plex'
    })));
  } catch (error) {
    console.error('Failed to search movies:', error);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

router.get('/overseerr/trending', requireNonGuestOrInvite, async (req, res) => {
  try {
    const movies = await getOverseerrTrending();
    res.json(movies);
  } catch (error) {
    console.error('Failed to get Overseerr trending:', error);
    res.status(500).json({ error: 'Failed to get trending movies' });
  }
});

router.get('/overseerr/status', requireNonGuestOrInvite, async (req, res) => {
  const config = await getOverseerrConfig();
  res.json({ configured: config.configured });
});

router.get('/tmdb/status', requireNonGuestOrInvite, async (req, res) => {
  const status = await validateTmdbApiKey();
  res.json(status);
});

router.get('/:ratingKey', requireNonGuestOrInvite, async (req, res) => {
  const { ratingKey } = req.params;

  try {
    const plexToken = getPlexToken();
    if (!plexToken) {
      return res.status(500).json({ error: 'Plex not configured' });
    }

    const { serverUrl } = await getPlexServerAndLibrary(plexToken);
    
    const response = await fetch(`${serverUrl}/library/metadata/${ratingKey}`, {
      headers: {
        'Accept': 'application/json',
        'X-Plex-Token': plexToken,
        'X-Plex-Client-Identifier': 'voterr'
      }
    });

    if (!response.ok) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const data = await response.json();
    const movie = data.MediaContainer?.Metadata?.[0];

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    res.json({
      ratingKey: movie.ratingKey,
      title: movie.title,
      year: movie.year,
      overview: movie.summary,
      runtime: movie.duration ? Math.round(movie.duration / 60000) : null,
      posterUrl: movie.thumb ? getProxiedImageUrl(`${serverUrl}${movie.thumb}?X-Plex-Token=${plexToken}`) : null
    });
  } catch (error) {
    console.error('Failed to get movie details:', error);
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

export default router;
