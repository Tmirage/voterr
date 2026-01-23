import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireNonGuestOrInvite } from '../middleware/auth.js';
import {
  getPlexServers,
  getPlexLibraries,
  getPlexMovies,
  searchPlexMovies,
} from '../services/plex.js';
import { getPlexToken } from '../services/settings.js';
import {
  searchOverseerrMovies,
  getOverseerrTrending,
  getOverseerrConfig,
  getOverseerrMovieByTmdbId,
  searchOverseerrMovieRating,
} from '../services/overseerr.js';
import {
  searchMovies as searchTmdbMovies,
  validateTmdbApiKey,
  getMovieDetails as getTmdbMovieDetails,
  findMovieRating,
} from '../services/tmdb.js';
import { getProxiedImageUrl } from '../services/imageCache.js';

interface PlexMediaContainer {
  MediaContainer?: {
    Metadata?: Array<{
      ratingKey: string;
      title: string;
      year?: number;
      summary?: string;
      duration?: number;
      thumb?: string;
    }>;
  };
}

const router = Router();

let cachedServerUrl: string | null = null;
let cachedMovieLibraryKey: string | null = null;
let cachedServerId: string | null = null;

export function clearPlexCache(): void {
  cachedServerUrl = null;
  cachedMovieLibraryKey = null;
  cachedServerId = null;
}

export async function ensurePlexServerId(plexToken: string | null): Promise<string | null> {
  if (cachedServerId) return cachedServerId;
  if (!plexToken) return null;
  try {
    const servers = await getPlexServers(plexToken);
    const firstServer = servers[0];
    if (firstServer) {
      cachedServerId = firstServer.clientIdentifier;
    }
    return cachedServerId;
  } catch {
    return null;
  }
}

export async function getPlexServerAndLibrary(
  plexToken: string
): Promise<{ serverUrl: string; libraryKey: string; serverId: string }> {
  if (cachedServerUrl && cachedMovieLibraryKey && cachedServerId) {
    return {
      serverUrl: cachedServerUrl,
      libraryKey: cachedMovieLibraryKey,
      serverId: cachedServerId,
    };
  }

  const servers = await getPlexServers(plexToken);
  const server = servers[0];
  if (!server) {
    throw new Error('No Plex servers found');
  }

  const connection = server.connections?.find((c) => c.local === false) || server.connections?.[0];
  if (!connection) {
    throw new Error('No Plex server connection found');
  }

  cachedServerUrl = connection.uri;
  cachedServerId = server.clientIdentifier;

  const libraries = await getPlexLibraries(cachedServerUrl, plexToken);
  const movieLibrary = libraries.find((lib) => lib.type === 'movie');
  if (!movieLibrary) {
    throw new Error('No movie library found in Plex');
  }

  cachedMovieLibraryKey = movieLibrary.key;

  return {
    serverUrl: cachedServerUrl,
    libraryKey: cachedMovieLibraryKey,
    serverId: cachedServerId,
  };
}

router.get('/library', requireNonGuestOrInvite, async (_req: Request, res: Response) => {
  try {
    const plexToken = getPlexToken();
    if (!plexToken) {
      res.status(500).json({ error: 'Plex not configured' });
      return;
    }

    const { serverUrl, libraryKey } = await getPlexServerAndLibrary(plexToken);
    const movies = await getPlexMovies(serverUrl, libraryKey, plexToken);

    res.json(
      movies.map((m) => ({
        ratingKey: m.ratingKey,
        title: m.title,
        year: m.year,
        overview: m.summary,
        runtime: m.duration,
        posterUrl: m.thumb,
        voteAverage: m.audienceRating || m.rating || null,
      }))
    );
  } catch (err: unknown) {
    console.error('Failed to get library:', err);
    res.status(500).json({ error: 'Failed to get movie library' });
  }
});

router.get('/search', requireNonGuestOrInvite, async (req: Request, res: Response) => {
  const q = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
  const source = Array.isArray(req.query.source) ? req.query.source[0] : req.query.source;

  if (!q || typeof q !== 'string' || q.length < 2) {
    res.status(400).json({ error: 'Search query must be at least 2 characters' });
    return;
  }

  try {
    if (source === 'overseerr') {
      const movies = await searchOverseerrMovies(q);
      res.json({ results: movies.slice(0, 20) });
      return;
    }

    if (source === 'tmdb') {
      const movies = await searchTmdbMovies(q);
      res.json(movies);
      return;
    }

    const plexToken = getPlexToken();
    if (!plexToken) {
      res.status(500).json({ error: 'Plex not configured' });
      return;
    }

    const { serverUrl } = await getPlexServerAndLibrary(plexToken);
    const movies = await searchPlexMovies(serverUrl, q, plexToken);

    res.json(
      movies.slice(0, 20).map((m) => ({
        ratingKey: m.ratingKey,
        title: m.title,
        year: m.year,
        overview: m.summary,
        runtime: m.duration,
        posterUrl: m.thumb,
        mediaType: 'plex',
        voteAverage: m.audienceRating || m.rating || null,
      }))
    );
  } catch (err: unknown) {
    console.error('Failed to search movies:', err);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

router.get('/overseerr/trending', requireNonGuestOrInvite, async (_req: Request, res: Response) => {
  try {
    const movies = await getOverseerrTrending();
    res.json(movies);
  } catch (err: unknown) {
    console.error('Failed to get Overseerr trending:', err);
    res.status(500).json({ error: 'Failed to get trending movies' });
  }
});

router.get('/overseerr/status', requireNonGuestOrInvite, async (_req: Request, res: Response) => {
  const config = getOverseerrConfig();
  res.json({ configured: config.configured });
});

router.get('/tmdb/status', requireNonGuestOrInvite, async (_req: Request, res: Response) => {
  const status = await validateTmdbApiKey();
  res.json(status);
});

router.get('/:ratingKey', requireNonGuestOrInvite, async (req: Request, res: Response) => {
  const { ratingKey } = req.params;

  try {
    const plexToken = getPlexToken();
    if (!plexToken) {
      res.status(500).json({ error: 'Plex not configured' });
      return;
    }

    const { serverUrl } = await getPlexServerAndLibrary(plexToken);

    const response = await fetch(`${serverUrl}/library/metadata/${ratingKey}`, {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': plexToken,
        'X-Plex-Client-Identifier': 'voterr',
      },
    });

    if (!response.ok) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    const data = (await response.json()) as PlexMediaContainer;
    const movie = data.MediaContainer?.Metadata?.[0];

    if (!movie) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }

    res.json({
      ratingKey: movie.ratingKey,
      title: movie.title,
      year: movie.year,
      overview: movie.summary,
      runtime: movie.duration ? Math.round(movie.duration / 60000) : null,
      posterUrl: movie.thumb
        ? getProxiedImageUrl(`${serverUrl}${movie.thumb}?X-Plex-Token=${plexToken}`)
        : null,
    });
  } catch (err: unknown) {
    console.error('Failed to get movie details:', err);
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

router.get('/tmdb/:tmdbId', requireNonGuestOrInvite, async (req: Request, res: Response) => {
  const tmdbIdParam = req.params.tmdbId;
  if (!tmdbIdParam || typeof tmdbIdParam !== 'string') {
    res.status(400).json({ error: 'tmdbId is required' });
    return;
  }
  const tmdbId = tmdbIdParam;

  try {
    let details = await getOverseerrMovieByTmdbId(tmdbId);

    if (!details) {
      details = await getTmdbMovieDetails(tmdbId);
    }

    if (!details) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }
    res.json(details);
  } catch (err: unknown) {
    console.error('Failed to get movie details:', err);
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

router.get('/rating', requireNonGuestOrInvite, async (req: Request, res: Response) => {
  const titleParam = req.query.title;
  const yearParam = req.query.year;
  const title = typeof titleParam === 'string' ? titleParam : undefined;
  const year = typeof yearParam === 'string' ? yearParam : undefined;

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  try {
    let result = await searchOverseerrMovieRating(title, year ?? '');

    if (!result) {
      result = await findMovieRating(title, year ?? '');
    }

    if (!result) {
      res.status(404).json({ error: 'Movie not found' });
      return;
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to find movie rating' });
  }
});

export default router;
