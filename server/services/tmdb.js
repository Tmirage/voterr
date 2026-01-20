import { getSetting } from './settings.js';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

function getApiKey() {
  return getSetting('tmdb_api_key');
}

export async function validateTmdbApiKey() {
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
  } catch (error) {
    return { configured: true, valid: false, error: 'Failed to connect to TMDB' };
  }
}

export async function searchMovies(query) {
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

    const data = await response.json();
    
    return data.results.slice(0, 20).map(movie => ({
      tmdbId: movie.id,
      mediaType: 'tmdb',
      title: movie.title,
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : null,
      posterUrl: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      overview: movie.overview,
      runtime: null,
      voteAverage: movie.vote_average || null
    }));
  } catch (error) {
    console.error('TMDB search error:', error);
    throw error;
  }
}

export async function getMovieDetails(tmdbId) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${apiKey}`);
    if (!response.ok) {
      return null;
    }
    const movie = await response.json();
    return {
      tmdbId: movie.id,
      title: movie.title,
      voteAverage: movie.vote_average || null,
      runtime: movie.runtime || null
    };
  } catch (error) {
    console.error('TMDB get movie error:', error);
    return null;
  }
}

export async function findMovieRating(title, year) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      query: title,
      include_adult: 'false'
    });
    if (year) {
      params.set('year', year);
    }
    
    const response = await fetch(`${TMDB_BASE_URL}/search/movie?${params.toString()}`);
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const movie = data.results?.[0];
    
    if (!movie) {
      return null;
    }
    
    return {
      tmdbId: movie.id,
      voteAverage: movie.vote_average || null
    };
  } catch (error) {
    console.error('TMDB find movie error:', error);
    return null;
  }
}

