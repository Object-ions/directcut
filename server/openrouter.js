import { openrouterKey } from './settings.js';

// OpenRouter generation adapter. Rates are conservative pre-flight estimates;
// OpenRouter's returned usage.cost is the authoritative charge after completion.
// Video is billed per token, tokens = width × height × 24fps × seconds / 1024:
// per-second rates below are that at 16:9 (the largest frame), rounded up.
export const RATES = {
  video: {
    'seedance-2.5': { '480p': 0.11, '720p': 0.24 },
    'seedance-2-fast': { '480p': 0.045, '720p': 0.095 },
  },
  image: {
    'seedream-5-pro': { '1K': 0.045, '2K': 0.09 },
    'seedream-5-lite': { '2K': 0.035, '4K': 0.035 },
  },
};

export const MODELS = {
  'seedance-2.5': 'bytedance/seedance-2.5',
  'seedance-2-fast': 'bytedance/seedance-2.0-fast',
  'seedream-5-pro': 'bytedance-seed/seedream-5-0-pro',
  'seedream-5-lite': 'bytedance-seed/seedream-5-0-lite',
};
export const VIDEO_TASK_TYPES = ['seedance-2.5', 'seedance-2-fast'];
export const IMAGE_TASK_TYPES = ['seedream-5-pro', 'seedream-5-lite'];
export const VIDEO_MODES = ['text_to_video', 'first_last_frames', 'omni_reference'];
export const VIDEO_ASPECT_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
export const IMAGE_ASPECT_RATIOS = ['1:1', '1:2', '2:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:20', '20:9', '9:21', '21:9', 'auto'];

const BASE_URL = 'https://openrouter.ai/api/v1';

export function estimateCost({ kind, task_type, resolution, size, duration, referenceCount = 0 }) {
  if (kind === 'video') {
    const rate = RATES.video[task_type]?.[resolution];
    return rate == null ? null : Math.round(rate * duration * 1000) / 1000;
  }
  const rate = RATES.image[task_type]?.[size];
  if (rate == null) return null;
  const inputCost = task_type === 'seedream-5-pro' ? referenceCount * 0.003 : 0;
  return Math.round((rate + inputCost) * 1000) / 1000;
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
    'ByteDance\'s content filter rejected this request (prompt or reference). Try rewording or a different reference.'],
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
