import { getSetting } from './settings.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

const TIMEOUT_MS = 3000;
const breaker = new CircuitBreaker('overseerr');

export function getOverseerrStatus() {
  const { configured } = getOverseerrConfig();
  return breaker.getStatus(configured);
}

export async function retryOverseerr() {
  breaker.reset();
  
  // Actually test the connection
  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured) {
    return { success: false, error: 'Not configured' };
  }
  
  try {
    const response = await fetchWithTimeout(`${url}/api/v1/status`, {
      headers: { 'X-Api-Key': apiKey }
    });
    
    if (!response.ok) {
      breaker.recordFailure(`HTTP ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
    
    breaker.recordSuccess();
    return { success: true };
  } catch (error) {
    breaker.recordFailure(error.message);
    return { success: false, error: error.message };
  }
}

export function getOverseerrConfig() {
  const url = getSetting('overseerr_url');
  const apiKey = getSetting('overseerr_api_key');
  return { url, apiKey, configured: !!(url && apiKey) };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function searchOverseerrMovies(query) {
  if (breaker.isOpen()) {
    return [];
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured) return [];

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

    const data = await response.json();
    breaker.recordSuccess();
    
    return data.results
      .filter(item => item.mediaType === 'movie')
      .map(movie => ({
        tmdbId: movie.id,
        title: movie.title || movie.originalTitle,
        year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
        posterUrl: movie.posterPath ? `https://image.tmdb.org/t/p/w500${movie.posterPath}` : null,
        overview: movie.overview,
        mediaType: 'overseerr',
        voteAverage: movie.voteAverage || null
      }));
  } catch (error) {
    breaker.recordFailure(error.message);
    return [];
  }
}

export async function getOverseerrTrending() {
  if (breaker.isOpen()) {
    return [];
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured) return [];

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/discover/movies?page=1&language=en`,
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

    const data = await response.json();
    breaker.recordSuccess();
    
    return data.results.map(movie => ({
      tmdbId: movie.id,
      title: movie.title || movie.originalTitle,
      year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
      posterUrl: movie.posterPath ? `https://image.tmdb.org/t/p/w500${movie.posterPath}` : null,
      overview: movie.overview,
      mediaType: 'overseerr',
      voteAverage: movie.voteAverage || null
    }));
  } catch (error) {
    breaker.recordFailure(error.message);
    return [];
  }
}

export async function getOverseerrMovieByTmdbId(tmdbId) {
  if (breaker.isOpen()) {
    return null;
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured) return null;

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/movie/${tmdbId}`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response || !response.ok) {
      return null;
    }

    const movie = await response.json();
    breaker.recordSuccess();
    
    return {
      tmdbId: movie.id,
      title: movie.title,
      voteAverage: movie.voteAverage || null,
      runtime: movie.runtime || null
    };
  } catch (error) {
    return null;
  }
}

export async function searchOverseerrMovieRating(title, year) {
  if (breaker.isOpen()) {
    return null;
  }

  const { url, apiKey, configured } = getOverseerrConfig();
  if (!configured) return null;

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/search?query=${encodeURIComponent(title)}&page=1&language=en`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response || !response.ok) {
      return null;
    }

    const data = await response.json();
    breaker.recordSuccess();
    
    const movie = data.results.find(item => {
      if (item.mediaType !== 'movie') return false;
      if (year) {
        const movieYear = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;
        return movieYear === parseInt(year);
      }
      return true;
    });

    if (!movie) return null;

    return {
      tmdbId: movie.id,
      voteAverage: movie.voteAverage || null
    };
  } catch (error) {
    return null;
  }
}

