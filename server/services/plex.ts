import { getProxiedImageUrl } from './imageCache.js';
import { logger } from './logger.js';

const PLEX_AUTH_URL = 'https://plex.tv/api/v2';
const TIMEOUT_MS = 10000;

interface PlexPin {
  id: number;
  code: string;
  authToken?: string;
}

interface PlexAuthResult {
  pinId: number;
  code: string;
  authUrl: string;
}

interface PlexUser {
  id: number;
  username: string;
  email: string;
  thumb?: string;
}

interface PlexFriend {
  id: string;
  username: string;
  email: string;
  thumb: string;
}

interface PlexServer {
  provides: string;
  clientIdentifier: string;
  name: string;
  connections?: Array<{ uri: string; local: boolean }>;
}

interface PlexLibrary {
  key: string;
  type: string;
  title: string;
}

interface PlexMovie {
  ratingKey: string;
  title: string;
  year?: number | undefined;
  summary?: string | undefined;
  duration?: number | undefined;
  thumb?: string | null | undefined;
  addedAt?: number | undefined;
  audienceRating?: number | null | undefined;
  rating?: number | null | undefined;
}

interface PlexMediaContainer<T> {
  MediaContainer?: {
    Metadata?: T[];
    Directory?: T[];
  };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    if (err instanceof Error && err.name === 'AbortError') {
      logger.error('plex', 'Plex request timed out', { url: url.split('?')[0] });
      throw new Error('Plex request timed out');
    }
    logger.error('plex', 'Plex request failed', { url: url.split('?')[0], error: errorMessage });
    throw err;
  }
}

export async function getPlexAuthUrl(
  clientId: string,
  forwardUrl: string | null = null
): Promise<PlexAuthResult> {
  const response = await fetchWithTimeout(`${PLEX_AUTH_URL}/pins`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Product': 'Voterr',
      'X-Plex-Version': '1.0.0',
      'X-Plex-Platform': 'Web',
    },
    body: JSON.stringify({ strong: true }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('Plex pin error:', response.status, text);
    throw new Error('Failed to create Plex pin');
  }

  const data = (await response.json()) as PlexPin;

  let authUrl = `https://app.plex.tv/auth#?clientID=${clientId}&code=${data.code}&context%5Bdevice%5D%5Bproduct%5D=Voterr&context%5Bdevice%5D%5Bplatform%5D=Web&context%5Bdevice%5D%5Bdevice%5D=Voterr`;

  if (forwardUrl) {
    authUrl += `&forwardUrl=${encodeURIComponent(forwardUrl)}`;
  }

  return {
    pinId: data.id,
    code: data.code,
    authUrl,
  };
}

export async function checkPlexPin(pinId: number, clientId: string): Promise<string | null> {
  const response = await fetchWithTimeout(`${PLEX_AUTH_URL}/pins/${pinId}`, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Client-Identifier': clientId,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to check Plex pin');
  }

  const data = (await response.json()) as PlexPin;
  return data.authToken || null;
}

export async function getPlexUser(token: string): Promise<PlexUser> {
  const response = await fetchWithTimeout(`${PLEX_AUTH_URL}/user`, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': token,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Plex user');
  }

  return response.json() as Promise<PlexUser>;
}

export async function getPlexFriends(plexToken: string): Promise<PlexFriend[]> {
  const response = await fetchWithTimeout('https://plex.tv/api/users', {
    headers: {
      Accept: 'application/xml',
      'X-Plex-Token': plexToken,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Plex users');
  }

  const xml = await response.text();
  const users: PlexFriend[] = [];
  const userRegex = /<User\s+([^>]+)>/g;
  let match: RegExpExecArray | null;

  while ((match = userRegex.exec(xml)) !== null) {
    const attrs = match[1] ?? '';
    const getId = /id="(\d+)"/.exec(attrs);
    const getUsername = /username="([^"]*)"/.exec(attrs);
    const getTitle = /title="([^"]*)"/.exec(attrs);
    const getEmail = /email="([^"]*)"/.exec(attrs);
    const getThumb = /thumb="([^"]*)"/.exec(attrs);

    if (getId?.[1]) {
      users.push({
        id: getId[1],
        username: getUsername?.[1] ?? getTitle?.[1] ?? '',
        email: getEmail?.[1] ?? '',
        thumb: getThumb?.[1] ?? '',
      });
    }
  }

  return users;
}

export async function getPlexServers(plexToken: string): Promise<PlexServer[]> {
  const response = await fetchWithTimeout(
    'https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1',
    {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': plexToken,
        'X-Plex-Client-Identifier': 'voterr',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get Plex servers');
  }

  const resources = (await response.json()) as PlexServer[];
  return resources.filter((r) => r.provides === 'server');
}

export async function getPlexLibraries(
  serverUrl: string,
  plexToken: string
): Promise<PlexLibrary[]> {
  const response = await fetchWithTimeout(`${serverUrl}/library/sections`, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': plexToken,
      'X-Plex-Client-Identifier': 'voterr',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to get Plex libraries');
  }

  const data = (await response.json()) as PlexMediaContainer<PlexLibrary>;
  return data.MediaContainer?.Directory || [];
}

interface PlexMovieRaw {
  ratingKey: string;
  title: string;
  year?: number;
  summary?: string;
  duration?: number;
  thumb?: string;
  addedAt?: number;
  audienceRating?: number;
  rating?: number;
}

export async function getPlexMovies(
  serverUrl: string,
  libraryKey: string,
  plexToken: string
): Promise<PlexMovie[]> {
  const response = await fetchWithTimeout(
    `${serverUrl}/library/sections/${libraryKey}/all?type=1`,
    {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': plexToken,
        'X-Plex-Client-Identifier': 'voterr',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get Plex movies');
  }

  const data = (await response.json()) as PlexMediaContainer<PlexMovieRaw>;
  return (data.MediaContainer?.Metadata || []).map((movie) => {
    const originalThumb = movie.thumb
      ? `${serverUrl}${movie.thumb}?X-Plex-Token=${plexToken}`
      : null;
    return {
      ratingKey: movie.ratingKey,
      title: movie.title,
      year: movie.year,
      summary: movie.summary,
      duration: movie.duration ? Math.round(movie.duration / 60000) : undefined,
      thumb: originalThumb ? getProxiedImageUrl(originalThumb) : null,
      addedAt: movie.addedAt,
      audienceRating: movie.audienceRating ?? null,
      rating: movie.rating ?? null,
    };
  });
}

export async function searchPlexMovies(
  serverUrl: string,
  query: string,
  plexToken: string
): Promise<PlexMovie[]> {
  const response = await fetchWithTimeout(
    `${serverUrl}/search?query=${encodeURIComponent(query)}&type=1`,
    {
      headers: {
        Accept: 'application/json',
        'X-Plex-Token': plexToken,
        'X-Plex-Client-Identifier': 'voterr',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to search Plex movies');
  }

  const data = (await response.json()) as PlexMediaContainer<PlexMovieRaw>;
  return (data.MediaContainer?.Metadata || []).map((movie) => {
    const originalThumb = movie.thumb
      ? `${serverUrl}${movie.thumb}?X-Plex-Token=${plexToken}`
      : null;
    return {
      ratingKey: movie.ratingKey,
      title: movie.title,
      year: movie.year,
      summary: movie.summary,
      duration: movie.duration ? Math.round(movie.duration / 60000) : undefined,
      thumb: originalThumb ? getProxiedImageUrl(originalThumb) : null,
      audienceRating: movie.audienceRating ?? null,
      rating: movie.rating ?? null,
    };
  });
}
