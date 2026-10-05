// Where the API lives. Set VITE_API_BASE when the SPA is hosted separately
// from the API (e.g. a static host); when unset, production builds assume the
// API is serving this page (same origin) and dev talks to localhost:3456.
const API_BASE =
  import.meta.env.VITE_API_BASE || (import.meta.env.PROD ? '' : 'http://localhost:3456');

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE) {
  console.warn(
    'VITE_API_BASE is not set — assuming the API serves this page (same origin). ' +
    'If the SPA is hosted separately from the API, set VITE_API_BASE at build time.'
  );
}

const STORAGE_KEY = 'directcut_key';

export function getKey() {
  return sessionStorage.getItem(STORAGE_KEY) || '';
}

export function setKey(key) {
  sessionStorage.setItem(STORAGE_KEY, key);
}

export function clearKey() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Thrown on 401 so the app can drop back to the password screen.
export class AuthError extends Error {}

// Thrown when the server has no password yet (fresh install).
export class SetupRequiredError extends Error {}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'X-App-Key': getKey(),
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    clearKey();
    throw new AuthError('unauthorized');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && data.setup_required) throw new SetupRequiredError('setup required');
  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const api = {
  setupStatus: () => request('/api/setup'),
  setup: (body) => request('/api/setup', json('POST', body)),
  settings: () => request('/api/settings'),
  saveOpenrouterKey: (key) => request('/api/settings/openrouter-key', json('PUT', { key })),
  removeOpenrouterKey: () => request('/api/settings/openrouter-key', { method: 'DELETE' }),
  changePassword: (current, next) => request('/api/settings/password', json('PUT', { current, next })),
  rates: () => request('/api/rates'),
  models: () => request('/api/models'),
  generations: (limit = 50) => request(`/api/generations?limit=${limit}`),
  remove: (id) => request(`/api/generations/${id}`, { method: 'DELETE' }),
  clearFailed: () => request('/api/generations?status=failed', { method: 'DELETE' }),
  task: (id) => request(`/api/tasks/${id}`),
  generate: (body) => request('/api/generate', { method: 'POST', body: JSON.stringify(body) }),
  enhance: (body) => request('/api/enhance', { method: 'POST', body: JSON.stringify(body) }),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('/api/upload', { method: 'POST', body: form });
  },
};
