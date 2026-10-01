// Baked-in fallback copy of the server's rate table, used only until
// GET /api/rates answers (and if it never does). The server is authoritative:
// applyServerRates() replaces these objects in place on fetch.
export const VIDEO_RATES = {
  'seedance-2.5': { '480p': 0.11, '720p': 0.11 },
  'seedance-2-fast': { '480p': 0.045, '720p': 0.045 },
};

export const IMAGE_RATES = {
  'seedream-5-lite': { '2K': 0.035, '4K': 0.035 },
  'seedream-5-pro': { '1K': 0.045, '2K': 0.09 },
};

function replaceInPlace(target, source) {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, source);
}

// Merge the server's rate table over the fallback. Returns true if applied.
export function applyServerRates(server) {
  if (!server || typeof server !== 'object') return false;
  if (server.video && Object.keys(server.video).length) replaceInPlace(VIDEO_RATES, server.video);
  if (server.image && Object.keys(server.image).length) replaceInPlace(IMAGE_RATES, server.image);
  return true;
}

export const videoTaskTypes = () => Object.keys(VIDEO_RATES);
export const imageTaskTypes = () => Object.keys(IMAGE_RATES);

export const VIDEO_MODES = [
  { value: 'text_to_video', label: 'text → video' },
  { value: 'first_last_frames', label: 'first / last frames' },
  { value: 'omni_reference', label: 'omni reference' },
];

export const VIDEO_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
export const IMAGE_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'];

export function estimateCost({ kind, taskType, resolution, size, duration }) {
  if (kind === 'video') {
    const rate = VIDEO_RATES[taskType]?.[resolution];
    return rate == null ? null : Math.round(rate * duration * 1000) / 1000;
  }
  return IMAGE_RATES[taskType]?.[size] ?? null;
}

export function resolutionsFor(taskType) {
  return Object.keys(VIDEO_RATES[taskType] || {});
}

export function sizesFor(taskType) {
  return Object.keys(IMAGE_RATES[taskType] || {});
}

export function maxDurationFor(taskType) {
  return taskType.startsWith('seedance-2.5') ? 30 : 15;
}
