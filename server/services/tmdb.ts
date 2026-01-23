import { getSetting } from './settings.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

interface TmdbValidationResult {
  configured: boolean;
  valid: boolean;
  error: string | null;
}

interface TmdbMovie {
  tmdbId: number;
  mediaType: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string;
  runtime: number | null;
  voteAverage: number | null;
}

interface TmdbMovieDetails {
  tmdbId: number;
  title: string;
  voteAverage: number | null;
  runtime: number | null;
}

interface TmdbRating {
  tmdbId: number;
  voteAverage: number | null;
}

interface TmdbSearchResult {
  id: number;
  title: string;
  release_date?: string;
  poster_path?: string;
  overview: string;
  vote_average?: number;
  runtime?: number;
}

interface TmdbSearchResponse {
  results: TmdbSearchResult[];
}

function getApiKey(): string | null {
  return getSetting('tmdb_api_key');
}

export async function validateTmdbApiKey(): Promise<TmdbValidationResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { configured: false, valid: false, error: null };
  }

  try {
    const response = await fetch(`${TMDB_BASE_URL}/configuration?api_key=${apiKey}`);
    if (!response.ok) {
      return { configured: true, valid: false, error: 'Invalid API key' };
    }
    return { configured: true, valid: true, error: null };
  } catch {
    return { configured: true, valid: false, error: 'Failed to connect to TMDB' };
  }
}

export async function searchMovies(query: string): Promise<TmdbMovie[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('TMDB API key not configured');
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&include_adult=false`
    );

    if (!response.ok) {
      throw new Error('TMDB search failed');
    }

    const data = (await response.json()) as TmdbSearchResponse;

    return data.results.slice(0, 20).map((movie) => ({
      tmdbId: movie.id,
      mediaType: 'tmdb',
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      overview: movie.overview,
      runtime: null,
      voteAverage: movie.vote_average ?? null,
    }));
  } catch (err: unknown) {
    console.error('TMDB search error:', err);
    throw err;
  }
}

export async function getMovieDetails(tmdbId: string | number): Promise<TmdbMovieDetails | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}`);
    if (!response.ok) {
      return null;
    }
    const movie = (await response.json()) as TmdbSearchResult;
    return {
      tmdbId: movie.id,
      title: movie.title,
      voteAverage: movie.vote_average ?? null,
      runtime: movie.runtime ?? null,
    };
  } catch (err: unknown) {
    console.error('TMDB get movie error:', err);
    return null;
  }
}

export async function findMovieRating(
  title: string,
  year?: string | number
): Promise<TmdbRating | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: title,
      include_adult: 'false',
    });
    if (year) {
      params.set('year', String(year));
    }

    const response = await fetch(`${TMDB_BASE_URL}/search/movie?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as TmdbSearchResponse;
    const movie = data.results[0];

    if (!movie) {
      return null;
    }

    return {
      tmdbId: movie.id,
      voteAverage: movie.vote_average ?? null,
    };
  } catch (err: unknown) {
    console.error('TMDB find movie error:', err);
    return null;
  }
}
