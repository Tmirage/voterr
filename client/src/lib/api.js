const BASE_URL = '/api';

let notificationCallback = null;
let plexErrorCallback = null;

export function setNotificationCallbacks(onNotification, onPlexError) {
  notificationCallback = onNotification;
  plexErrorCallback = onPlexError;
}

export function getNotificationCallback() {
  return notificationCallback;
}

async function request(method, endpoint, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include'
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}${endpoint}`, options);
  } catch (error) {
    if (plexErrorCallback) {
      plexErrorCallback({ details: error.message });
    }
    throw new Error('Network error - unable to reach server');
  }
  
  if (!response.ok) {
    if (response.status === 401) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login' && !currentPath.startsWith('/join/') && currentPath !== '/setup') {
        window.location.href = '/login';
        return;
      }
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  const data = await response.json();
  return data;
}

async function uploadRequest(endpoint, formData) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
    credentials: 'include'
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

export const api = {
  get: (endpoint) => request('GET', endpoint),
  post: (endpoint, body) => request('POST', endpoint, body),
  patch: (endpoint, body) => request('PATCH', endpoint, body),
  delete: (endpoint) => request('DELETE', endpoint),
  upload: (endpoint, formData) => uploadRequest(endpoint, formData)
};
