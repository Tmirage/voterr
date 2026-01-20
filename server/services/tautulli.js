import { getSetting } from './settings.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

const TIMEOUT_MS = 5000;
const breaker = new CircuitBreaker('tautulli');

export function getTautulliStatus() {
  const { configured } = getTautulliConfig();
  return breaker.getStatus(configured);
}

export async function retryTautulli() {
  breaker.reset();
  
  // Actually test the connection
  const { url: tautulliUrl, apiKey, configured } = getTautulliConfig();
  if (!configured) {
    return { success: false, error: 'Not configured' };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    
    const response = await fetch(`${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=arnold`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
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

function getTautulliConfig() {
  const url = getSetting('tautulli_url');
  const apiKey = getSetting('tautulli_api_key');
  return { url, apiKey, configured: !!(url && apiKey) };
}

async function tautulliRequest(cmd, params = {}) {
  if (breaker.isOpen()) {
    return null;
  }

  const { url: tautulliUrl, apiKey, configured } = getTautulliConfig();
  
  if (!configured) {
    return null;
  }

  const url = new URL(`${tautulliUrl}/api/v2`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('cmd', cmd);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      breaker.recordFailure(`HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (data.response?.result !== 'success') {
      breaker.recordFailure(data.response?.message || 'Unknown error');
      return null;
    }

    breaker.recordSuccess();
    return data.response.data;
  } catch (error) {
    clearTimeout(timeoutId);
    breaker.recordFailure(error.name === 'AbortError' ? 'Connection timed out' : error.message);
    return null;
  }
}

export async function hasUserWatchedMovie(plexUserId, ratingKey, title) {
  const history = await tautulliRequest('get_history', {
    user_id: plexUserId,
    media_type: 'movie',
    length: 1000
  });

  if (!history) return false;

  return (history.data || []).some(item => {
    if (ratingKey && (item.rating_key === ratingKey || item.rating_key === parseInt(ratingKey))) {
      return true;
    }
    if (title && item.title && item.title.toLowerCase() === title.toLowerCase()) {
      return true;
    }
    return false;
  });
}

