import { getSetting } from './settings.js';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

const TIMEOUT_MS = 3000;
const breaker = new CircuitBreaker('tautulli');

interface TautulliConfig {
  url: string | null;
  apiKey: string | null;
  configured: boolean;
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

interface TautulliResponse {
  response?: {
    result: string;
    message?: string;
    data?: unknown;
  };
}

interface HistoryItem {
  rating_key: string | number;
  title: string;
}

interface HistoryData {
  data?: HistoryItem[];
}

export function getTautulliStatus(): ServiceStatus {
  const { configured } = getTautulliConfig();
  return breaker.getStatus(configured);
}

export function resetTautulliCircuit(): void {
  breaker.reset();
}

export async function retryTautulli(): Promise<RetryResult> {
  breaker.reset();

  const { url: tautulliUrl, apiKey, configured } = getTautulliConfig();
  if (!configured || !tautulliUrl || !apiKey) {
    return { success: false, error: 'Not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch(`${tautulliUrl}/api/v2?apikey=${apiKey}&cmd=arnold`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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

function getTautulliConfig(): TautulliConfig {
  const url = getSetting('tautulli_url');
  const apiKey = getSetting('tautulli_api_key');
  return { url, apiKey, configured: !!(url && apiKey) };
}

async function tautulliRequest(
  cmd: string,
  params: Record<string, string | number> = {}
): Promise<unknown | null> {
  if (breaker.isOpen()) {
    return null;
  }

  const { url: tautulliUrl, apiKey, configured } = getTautulliConfig();

  if (!configured || !tautulliUrl || !apiKey) {
    return null;
  }

  const url = new URL(`${tautulliUrl}/api/v2`);
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('cmd', cmd);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
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

    const data = (await response.json()) as TautulliResponse;

    if (data.response?.result !== 'success') {
      breaker.recordFailure(data.response?.message || 'Unknown error');
      return null;
    }

    breaker.recordSuccess();
    return data.response.data;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const message =
      err instanceof Error
        ? err.name === 'AbortError'
          ? 'Connection timed out'
          : err.message
        : 'Unknown error';
    breaker.recordFailure(message);
    return null;
  }
}

export async function hasUserWatchedMovie(
  plexUserId: string | number,
  ratingKey: string | null,
  title: string | null
): Promise<boolean> {
  const history = (await tautulliRequest('get_history', {
    user_id: String(plexUserId),
    media_type: 'movie',
    length: 1000,
  })) as HistoryData | null;

  if (!history) return false;

  return (history.data || []).some((item) => {
    if (
      ratingKey &&
      (item.rating_key === ratingKey || item.rating_key === parseInt(String(ratingKey)))
    ) {
      return true;
    }
    if (title && item.title && item.title.toLowerCase() === title.toLowerCase()) {
      return true;
    }
    return false;
  });
}
