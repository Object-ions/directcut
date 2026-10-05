import { openrouterKey } from './settings.js';

import {
  VIDEO_MODELS, IMAGE_MODELS, estimateVideoCost, estimateImageCost,
} from './models.js';

// OpenRouter generation adapter. The lineup, capabilities and conservative
// rates live in models.js; these are the flat views older callers use.
// OpenRouter's returned usage.cost is the authoritative charge after completion.
const ratesOf = (table) => Object.fromEntries(Object.entries(table).map(([k, m]) => [k, m.rates]));
export const RATES = {
  get video() { return ratesOf(VIDEO_MODELS); },
  get image() { return ratesOf(IMAGE_MODELS); },
};

export const MODELS = Object.fromEntries(
  [...Object.entries(VIDEO_MODELS), ...Object.entries(IMAGE_MODELS)].map(([k, m]) => [k, m.id]),
);
export const VIDEO_TASK_TYPES = Object.keys(VIDEO_MODELS);
export const IMAGE_TASK_TYPES = Object.keys(IMAGE_MODELS);
export const VIDEO_MODES = ['text_to_video', 'first_last_frames', 'omni_reference'];

const BASE_URL = 'https://openrouter.ai/api/v1';

export function estimateCost({ kind, task_type, resolution, size, duration, sound, referenceCount = 0, frameCount = 0 }) {
  return kind === 'video'
    ? estimateVideoCost(task_type, { resolution, duration, sound, frameCount })
    : estimateImageCost(task_type, { size, referenceCount });
}

// Unauthenticated GET against the public catalog (no key needed).
export async function fetchCatalog(path) {
  const res = await fetch(`${BASE_URL}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`catalog HTTP ${res.status}`);
  return res.json();
}

// OpenRouter app attribution (shows up on openrouter.ai/activity).
const APP_URL = 'https://github.com/Object-ions/directcut';

export class MissingKeyError extends Error {
  constructor() {
    super('No OpenRouter key yet — add one in Settings (gear icon).');
    this.status = 400;
  }
}

// ByteDance's rejections arrive as nested JSON inside OpenRouter's message.
// Translate the ones users actually hit into something they can act on.
const KNOWN_REJECTIONS = [
  [/may contain real person|PrivacyInformation/i,
    'Seedance blocks photo-realistic faces in video references and start/end frames: it can\'t tell an '
    + 'AI-generated person from a real one. Use an illustrated or stylized face for video, or use the '
    + 'photo-real face with Seedream (image), which accepts it.'],
  [/pixel count/i,
    'A video reference is too small: Seedance needs about 640×640 pixels or more.'],
  [/SensitiveContent|content policy|moderation/i,
    'The model\'s content filter rejected this request (prompt or reference). Try rewording or a different reference.'],
];

export function friendlyError(status, message) {
  const known = KNOWN_REJECTIONS.find(([re]) => re.test(message));
  return known ? known[1] : `OpenRouter error (HTTP ${status}): ${message}`;
}

async function openrouterFetch(path, options = {}, key = openrouterKey()) {
  if (!key) throw new MissingKeyError();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': APP_URL,
      'X-Title': 'Directcut',
      ...options.headers,
    },
  });
  const type = res.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    if (!res.ok) throw new Error(`OpenRouter error (HTTP ${res.status})`);
    return res;
  }
  const body = await res.json();
  if (!res.ok) {
    throw Object.assign(
      new Error(friendlyError(res.status, body?.error?.message || body?.message || 'request failed')),
      { httpStatus: res.status },
    );
  }
  return body;
}

export function createTask(payload, kind) {
  return openrouterFetch(kind === 'image' ? '/images' : '/videos', {
    method: 'POST', body: JSON.stringify(payload),
  });
}

export function getTask(taskId) {
  return openrouterFetch(`/videos/${encodeURIComponent(taskId)}`);
}

export function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (['completed', 'succeeded', 'success'].includes(s)) return 'completed';
  if (['failed', 'cancelled', 'canceled', 'expired'].includes(s)) return 'failed';
  if (['pending', 'queued'].includes(s)) return 'queued';
  return 'processing';
}

export function normalizeTask(result, kind) {
  if (kind === 'image') {
    return { id: null, status: 'completed', images: result?.data || [], urls: [], usage: result?.usage || null };
  }
  return {
    id: result?.id || result?.job_id || null,
    status: result?.status || 'queued',
    urls: result?.unsigned_urls || result?.urls || [],
    usage: result?.usage || null,
    error: result?.error || null,
  };
}

export async function downloadVideo(taskId) {
  const res = await openrouterFetch(`/videos/${encodeURIComponent(taskId)}/content?index=0`, {
    headers: { Accept: 'video/mp4' },
  });
  return res;
}

// Checks a candidate key before it is saved. GET /key returns the key's own
// metadata (label, limit, usage) and 401s for anything invalid.
export async function verifyKey(key) {
  const body = await openrouterFetch('/key', {}, key);
  return body?.data || {};
}

// One-shot chat completion, used by the prompt enhancer.
export async function chat({ model, system, user, maxTokens = 1024 }) {
  const body = await openrouterFetch('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  return body?.choices?.[0]?.message?.content || '';
}

// usage.cost (USD) when OpenRouter reports it, otherwise null.
export function actualCost(normalized) {
  const cost = Number(normalized?.usage?.cost);
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}
