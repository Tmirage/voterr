import { getSetting } from './settings.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

const TIMEOUT_MS = 3000;
const breaker = new CircuitBreaker('overseerr');

interface OverseerrConfig {
  url: string | null;
  apiKey: string | null;
  configured: boolean;
}

interface OverseerrMovie {
  tmdbId: number;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string;
  mediaType: string;
  voteAverage: number | null;
}

interface OverseerrMovieDetails {
  tmdbId: number;
  title: string;
  voteAverage: number | null;
  runtime: number | null;
}

interface OverseerrRating {
  tmdbId: number;
  voteAverage: number | null;
}

interface OverseerrSearchResult {
  id: number;
  mediaType: string;
  title?: string;
  originalTitle?: string;
  releaseDate?: string;
  posterPath?: string;
  overview: string;
  voteAverage?: number;
  runtime?: number;
}

interface OverseerrSearchResponse {
  results: OverseerrSearchResult[];
}

interface ServiceStatus {
  configured: boolean;
  failed?: boolean;
  error?: string | null;
  circuitOpen?: boolean;
  remainingMinutes?: number;
}

interface RetryResult {
  success: boolean;
  error?: string;
}

export function getOverseerrStatus(): ServiceStatus {
  const { configured } = getOverseerrConfig();
  return breaker.getStatus(configured);
}

export function resetOverseerrCircuit(): void {
  breaker.reset();
}

export async function retryOverseerr(): Promise<RetryResult> {
  breaker.reset();

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured || !url || !apiKey) {
    return { success: false, error: 'Not configured' };
  }

  try {
    const response = await fetchWithTimeout(`${url}/api/v1/status`, {
      headers: { 'X-Api-Key': apiKey },
    });

    if (!response) {
      breaker.recordFailure('Connection timed out');
      return { success: false, error: 'Connection timed out' };
    }

    if (!response.ok) {
      breaker.recordFailure(`HTTP ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    breaker.recordSuccess();
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    breaker.recordFailure(message);
    return { success: false, error: message };
  }
}

export function getOverseerrConfig(): OverseerrConfig {
  const url = getSetting('overseerr_url');
  const apiKey = getSetting('overseerr_api_key');
  return { url, apiKey, configured: !!(url && apiKey) };
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function searchOverseerrMovies(query: string): Promise<OverseerrMovie[]> {
  if (breaker.isOpen()) {
    return [];
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured || !url || !apiKey) return [];

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/search?query=${encodeURIComponent(query)}&page=1&language=en`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response) {
      breaker.recordFailure('Connection timed out');
      return [];
    }
    if (!response.ok) {
      breaker.recordFailure(`HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as OverseerrSearchResponse;
    breaker.recordSuccess();

    return data.results
      .filter((item) => item.mediaType === 'movie')
      .map((movie) => ({
        tmdbId: movie.id,
        title: movie.title || movie.originalTitle || '',
        year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
        posterUrl: movie.posterPath ? `https://image.tmdb.org/t/p/w500${movie.posterPath}` : null,
        overview: movie.overview,
        mediaType: 'overseerr',
        voteAverage: movie.voteAverage ?? null,
      }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    breaker.recordFailure(message);
    return [];
  }
}

export async function getOverseerrTrending(): Promise<OverseerrMovie[]> {
  if (breaker.isOpen()) {
    return [];
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured || !url || !apiKey) return [];

  try {
    const response = await fetchWithTimeout(`${url}/api/v1/discover/movies?page=1&language=en`, {
      headers: { 'X-Api-Key': apiKey },
    });

    if (!response) {
      breaker.recordFailure('Connection timed out');
      return [];
    }
    if (!response.ok) {
      breaker.recordFailure(`HTTP ${response.status}`);
      return [];
    }

    const data = (await response.json()) as OverseerrSearchResponse;
    breaker.recordSuccess();

    return data.results.map((movie) => ({
      tmdbId: movie.id,
      title: movie.title || movie.originalTitle || '',
      year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
      posterUrl: movie.posterPath ? `https://image.tmdb.org/t/p/w500${movie.posterPath}` : null,
      overview: movie.overview,
      mediaType: 'overseerr',
      voteAverage: movie.voteAverage ?? null,
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    breaker.recordFailure(message);
    return [];
  }
}

export async function getOverseerrMovieByTmdbId(
  tmdbId: string | number
): Promise<OverseerrMovieDetails | null> {
  if (breaker.isOpen()) {
    return null;
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured || !url || !apiKey) return null;

  try {
    const response = await fetchWithTimeout(`${url}/api/v1/movie/${tmdbId}`, {
      headers: { 'X-Api-Key': apiKey },
    });

    if (!response || !response.ok) {
      return null;
    }

    const movie = (await response.json()) as OverseerrSearchResult;
    breaker.recordSuccess();

    return {
      tmdbId: movie.id,
      title: movie.title || '',
      voteAverage: movie.voteAverage ?? null,
      runtime: movie.runtime ?? null,
    };
  } catch {
    return null;
  }
}

export async function searchOverseerrMovieRating(
  title: string,
  year?: string | number
): Promise<OverseerrRating | null> {
  if (breaker.isOpen()) {
    return null;
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured || !url || !apiKey) return null;

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/search?query=${encodeURIComponent(title)}&page=1&language=en`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response || !response.ok) {
      return null;
    }

    const data = (await response.json()) as OverseerrSearchResponse;
    breaker.recordSuccess();

    const movie = data.results.find((item) => {
      if (item.mediaType !== 'movie') return false;
      if (year) {
        const movieYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
        return movieYear === parseInt(String(year));
      }
      return true;
    });

    if (!movie) return null;

    return {
      tmdbId: movie.id,
      voteAverage: movie.voteAverage ?? null,
    };
  } catch {
    return null;
  }
}
