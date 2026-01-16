import { getSetting } from './settings.js';
import { getProxiedImageUrl } from './imageCache.js';

const TIMEOUT_MS = 5000;
const CIRCUIT_BREAKER_DURATION = 5 * 60 * 1000;
let lastFailure = null;
let lastFailureTime = 0;
let circuitOpen = false;
let circuitOpenUntil = 0;

export function getOverseerrStatus() {
  const url = getSetting('overseerr_url');
  const apiKey = getSetting('overseerr_api_key');
  const configured = !!(url && apiKey);
  if (!configured) return { configured: false };
  
  const now = Date.now();
  if (circuitOpen && now < circuitOpenUntil) {
    const remainingMs = circuitOpenUntil - now;
    const remainingMin = Math.ceil(remainingMs / 60000);
    return { 
      configured: true, 
      failed: true, 
      error: lastFailure,
      circuitOpen: true,
      remainingMinutes: remainingMin
    };
  }
  
  if (circuitOpen && now >= circuitOpenUntil) {
    circuitOpen = false;
  }
  
  if (lastFailure && (now - lastFailureTime) < 60000) {
    return { configured: true, failed: true, error: lastFailure };
  }
  return { configured: true, failed: false };
}

export function retryOverseerr() {
  circuitOpen = false;
  circuitOpenUntil = 0;
  lastFailure = null;
  lastFailureTime = 0;
}

function isCircuitOpen() {
  if (!circuitOpen) return false;
  if (Date.now() >= circuitOpenUntil) {
    circuitOpen = false;
    return false;
  }
  return true;
}

export async function getOverseerrConfig() {
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
  if (isCircuitOpen()) {
    return [];
  }

  const { url, apiKey, configured } = await getOverseerrConfig();
  if (!configured) return [];

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/search?query=${encodeURIComponent(query)}&page=1&language=en`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response) {
      lastFailure = 'Connection timed out';
      lastFailureTime = Date.now();
      circuitOpen = true;
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
      return [];
    }
    if (!response.ok) {
      lastFailure = `HTTP ${response.status}`;
      lastFailureTime = Date.now();
      circuitOpen = true;
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
      return [];
    }

    const data = await response.json();
    lastFailure = null;
    lastFailureTime = 0;
    
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
    lastFailure = error.message;
    lastFailureTime = Date.now();
    circuitOpen = true;
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
    return [];
  }
}

export async function getOverseerrTrending() {
  if (isCircuitOpen()) {
    return [];
  }

  const { url, apiKey, configured } = await getOverseerrConfig();
  if (!configured) return [];

  try {
    const response = await fetchWithTimeout(
      `${url}/api/v1/discover/movies?page=1&language=en`,
      { headers: { 'X-Api-Key': apiKey } }
    );

    if (!response) {
      lastFailure = 'Connection timed out';
      lastFailureTime = Date.now();
      circuitOpen = true;
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
      return [];
    }
    if (!response.ok) {
      lastFailure = `HTTP ${response.status}`;
      lastFailureTime = Date.now();
      circuitOpen = true;
      circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
      return [];
    }

    const data = await response.json();
    lastFailure = null;
    lastFailureTime = 0;
    
    return data.results.map(movie => ({
      tmdbId: movie.id,
      title: movie.title || movie.originalTitle,
      year: movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : null,
      posterUrl: movie.posterPath ? getProxiedImageUrl(`https://image.tmdb.org/t/p/w500${movie.posterPath}`) : null,
      overview: movie.overview,
      mediaType: 'overseerr'
    }));
  } catch (error) {
    lastFailure = error.message;
    lastFailureTime = Date.now();
    circuitOpen = true;
    circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
    return [];
  }
}

