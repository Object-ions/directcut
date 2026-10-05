// The model lineup as the server describes it (GET /api/models): what each
// model accepts and its conservative rates. The baked-in copy below only
// covers the render until that answers (and if it never does);
// applyServerModels() replaces it in place.
const span = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);
const SEEDANCE_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const SEEDREAM_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'];

export const MODELS = {
  video: [
    {
      key: 'seedance-2.5', label: 'Seedance 2.5', note: 'best with references: character, style, motion, voice',
      durations: span(4, 30), aspects: SEEDANCE_ASPECTS, frames: ['first_frame', 'last_frame'],
      references: { image: 14, video: 10, audio: 10, total: null }, sound: false, autoAspect: true,
      rates: { '480p': 0.11, '720p': 0.24 },
    },
    {
      key: 'seedance-2-fast', label: 'Seedance 2 Fast', note: 'cheapest drafts, takes references',
      durations: span(4, 15), aspects: SEEDANCE_ASPECTS, frames: ['first_frame', 'last_frame'],
      references: { image: 14, video: 9, audio: 12, total: 12 }, sound: false, autoAspect: true,
      rates: { '480p': 0.045, '720p': 0.095 },
    },
  ],
  image: [
    {
      key: 'seedream-5-pro', label: 'Seedream 5 Pro', note: 'photo-real, accepts real-looking faces',
      sizeParam: 'resolution', aspects: SEEDREAM_ASPECTS, maxReferences: 14,
      rates: { '1K': 0.045, '2K': 0.09 }, perReference: 0.003,
    },
    {
      key: 'seedream-5-lite', label: 'Seedream 5 Lite', note: 'cheap 2K and 4K',
      sizeParam: 'resolution', aspects: SEEDREAM_ASPECTS, maxReferences: 14,
      rates: { '2K': 0.035, '4K': 0.035 }, perReference: 0,
    },
  ],
};

// Swap in the server's lineup. Returns true if applied.
export function applyServerModels(server) {
  if (!server || !Array.isArray(server.video) || !Array.isArray(server.image)) return false;
  if (!server.video.length || !server.image.length) return false;
  MODELS.video = server.video;
  MODELS.image = server.image;
  return true;
}

export const modelsFor = (kind) => MODELS[kind];
export const modelFor = (kind, key) => MODELS[kind].find((m) => m.key === key) || MODELS[kind][0];

export const resolutionsFor = (model) => Object.keys(model.rates);
export const sizesFor = (model) => Object.keys(model.rates);

// 'auto' (match the start frame's shape) only for models that support it.
export function aspectsFor(model, mode) {
  return mode === 'first_last_frames' && model.autoAspect ? [...model.aspects, 'auto'] : model.aspects;
}

// True when every whole second between the first and last length is allowed,
// so a slider fits; otherwise the lengths are shown as buttons.
export function durationsContiguous(model) {
  const d = model.durations;
  return d.length === d[d.length - 1] - d[0] + 1;
}

export function nearestDuration(model, duration) {
  return model.durations.reduce((best, d) => (Math.abs(d - duration) < Math.abs(best - duration) ? d : best));
}

const round = (n) => Math.round(n * 1000) / 1000;

// Mirrors the server's estimate (models.js).
export function estimateCost({ kind, taskType, resolution, size, duration, sound = true, referenceCount = 0, frameCount = 0 }) {
  const model = modelFor(kind, taskType);
  if (kind === 'video') {
    const rate = model.rates[resolution];
    if (rate == null) return null;
    const perSecond = !sound && model.sound ? (model.silent?.[resolution] ?? rate) : rate;
    return round(perSecond * duration + (model.perFrameImage || 0) * frameCount);
  }
  const rate = model.rates[size];
  if (rate == null) return null;
  return round(rate + (model.perReference || 0) * referenceCount);
}

// Params adjusted so they're valid for `model` (after a model or mode change).
export function fitParams(params, model, mode) {
  const next = { ...params, taskType: model.key };
  if (params.kind === 'video') {
    if (!resolutionsFor(model).includes(next.resolution)) next.resolution = resolutionsFor(model)[0];
    if (!model.durations.includes(next.duration)) next.duration = nearestDuration(model, next.duration);
  } else if (!sizesFor(model).includes(next.size)) {
    next.size = sizesFor(model)[0];
  }
  const aspects = params.kind === 'video' ? aspectsFor(model, mode) : model.aspects;
  if (!aspects.includes(next.aspectRatio)) {
    next.aspectRatio = aspects.includes('16:9') && params.kind === 'video' ? '16:9' : aspects[0];
  }
  return next;
}
