import { getSetting } from './settings.js';
import { getProxiedImageUrl } from './imageCache.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

const TIMEOUT_MS = 5000;
const breaker = new CircuitBreaker('overseerr');

export function getOverseerrStatus() {
  const { configured } = getOverseerrConfig();
  return breaker.getStatus(configured);
}

export function retryOverseerr() {
  breaker.reset();
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
        posterUrl: movie.posterPath ? getProxiedImageUrl(`https://image.tmdb.org/t/p/w500${movie.posterPath}`) : null,
        overview: movie.overview,
        mediaType: 'overseerr'
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
      posterUrl: movie.posterPath ? getProxiedImageUrl(`https://image.tmdb.org/t/p/w500${movie.posterPath}`) : null,
      overview: movie.overview,
      mediaType: 'overseerr'
    }));
  } catch (error) {
    breaker.recordFailure(error.message);
    return [];
  }
}

