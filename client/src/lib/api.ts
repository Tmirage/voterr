const BASE_URL = '/api';

type NotificationCallback =
  | ((
      message: string,
      type?: 'success' | 'error' | 'info' | 'warning',
      duration?: number,
      service?: string | null,
      circuitOpen?: boolean
    ) => number)
  | null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let notificationCallback: NotificationCallback = null;
let csrfToken: string | null = null;

async function ensureCsrfToken(): Promise<string> {
  if (!csrfToken) {
    const response = await fetch(`${BASE_URL}/csrf-token`, { credentials: 'include' });
    const data: { token: string } = await response.json();
    csrfToken = data.token;
  }
  return csrfToken as string;
}

export function setNotificationCallbacks(onNotification: NotificationCallback): void {
  notificationCallback = onNotification;
}

async function request<T = unknown>(
  method: string,
  endpoint: string,
  body: unknown = null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, options);
  } catch (err: unknown) {
    throw new Error('Network error - unable to reach server');
  }

  if (!response.ok) {
    if (response.status === 401) {
      const currentPath = window.location.pathname;
      if (
        currentPath !== '/login' &&
        !currentPath.startsWith('/join/') &&
        currentPath !== '/setup'
      ) {
        window.location.href = '/login';
        return undefined as T;
      }
    }
    if (response.status === 403) {
      // CSRF token might be stale - clear it so it gets refreshed on next request
      csrfToken = null;
    }
    const errorData: { error?: string } = await response
      .json()
      .catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || 'Request failed');
  }

  const data: T = await response.json();
  return data;
}

async function uploadRequest<T = unknown>(endpoint: string, formData: FormData): Promise<T> {
  const token = await ensureCsrfToken();
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      'X-CSRF-Token': token,
    },
  });

  if (!response.ok) {
    const errorData: { error?: string } = await response
      .json()
      .catch(() => ({ error: 'Upload failed' }));
    throw new Error(errorData.error || 'Upload failed');
  }

  return response.json();
}

export const api = {
  get: <T = unknown>(endpoint: string): Promise<T> => request<T>('GET', endpoint),
  post: <T = unknown>(endpoint: string, body?: unknown): Promise<T> =>
    request<T>('POST', endpoint, body),
  patch: <T = unknown>(endpoint: string, body?: unknown): Promise<T> =>
    request<T>('PATCH', endpoint, body),
  delete: <T = unknown>(endpoint: string): Promise<T> => request<T>('DELETE', endpoint),
  upload: <T = unknown>(endpoint: string, formData: FormData): Promise<T> =>
    uploadRequest<T>(endpoint, formData),
};
