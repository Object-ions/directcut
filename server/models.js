// The model lineup: one entry per model the UI offers, with what it accepts
// and a conservative per-unit rate. Rates were read off OpenRouter's catalog
// (GET /videos/models, /images/models/:id/endpoints) and rounded up;
// refreshCatalog() can only raise them, never lower them, so the daily cap
// stays safe if a price goes up. OpenRouter's usage.cost replaces the
// estimate on completion either way.

const span = (min, max) => Array.from({ length: max - min + 1 }, (_, i) => min + i);

const SEEDANCE_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const SEEDREAM_ASPECTS = ['1:1', '1:2', '2:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '9:20', '20:9', '9:21', '21:9', 'auto'];
const BOTH_FRAMES = ['first_frame', 'last_frame'];

// rates: USD per second by resolution, with sound on (the default).
// silent: USD per second when sound is switched off, where that's cheaper.
// sound: true when the model takes generate_audio (a sound on/off switch).
// references: Seedance's multi-reference mode (character/style/motion/voice).
// autoAspect: the model can take its shape from the start frame.
export const VIDEO_MODELS = {
  'seedance-2.5': {
    id: 'bytedance/seedance-2.5', label: 'Seedance 2.5', note: 'best with references: character, style, motion, voice',
    durations: span(4, 30), aspects: SEEDANCE_ASPECTS, frames: BOTH_FRAMES,
    references: { image: 14, video: 10, audio: 10, total: Infinity }, sound: false, autoAspect: true,
    // Billed per token (width × height × 24fps × seconds / 1024), at 16:9.
    rates: { '480p': 0.11, '720p': 0.24 },
  },
  'seedance-2-fast': {
    id: 'bytedance/seedance-2.0-fast', label: 'Seedance 2 Fast', note: 'cheapest drafts, takes references',
    durations: span(4, 15), aspects: SEEDANCE_ASPECTS, frames: BOTH_FRAMES,
    references: { image: 14, video: 9, audio: 12, total: 12 }, sound: false, autoAspect: true,
    rates: { '480p': 0.045, '720p': 0.095 },
  },
  'kling-3-pro': {
    id: 'kwaivgi/kling-v3.0-pro', label: 'Kling 3.0 Pro', note: 'realistic people: accepts photo-real faces',
    durations: span(3, 15), aspects: ['16:9', '9:16', '1:1'], frames: BOTH_FRAMES,
    references: null, sound: true, autoAspect: false,
    rates: { '720p': 0.168 }, silent: { '720p': 0.112 },
  },
  'kling-3-std': {
    id: 'kwaivgi/kling-v3.0-std', label: 'Kling 3.0 Standard', note: 'realistic people, cheaper',
    durations: span(3, 15), aspects: ['16:9', '9:16', '1:1'], frames: BOTH_FRAMES,
    references: null, sound: true, autoAspect: false,
    rates: { '720p': 0.126 }, silent: { '720p': 0.084 },
  },
  'veo-3.1': {
    id: 'google/veo-3.1', label: 'Veo 3.1', note: 'premium quality and sound, up to 4K',
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], frames: BOTH_FRAMES,
    references: null, sound: true, autoAspect: false,
    rates: { '720p': 0.40, '1080p': 0.40, '4K': 0.60 }, silent: { '720p': 0.20, '1080p': 0.20, '4K': 0.40 },
  },
  'veo-3.1-fast': {
    id: 'google/veo-3.1-fast', label: 'Veo 3.1 Fast', note: 'Veo quality for less',
    durations: [4, 6, 8], aspects: ['16:9', '9:16'], frames: BOTH_FRAMES,
    references: null, sound: true, autoAspect: false,
    rates: { '720p': 0.12, '1080p': 0.12, '4K': 0.30 }, silent: { '720p': 0.10, '1080p': 0.10, '4K': 0.25 },
  },
  'wan-3': {
    id: 'alibaba/wan-3.0', label: 'Wan 3.0', note: 'cheap 1080p, clips up to 30s',
    durations: span(2, 30), aspects: ['16:9', '4:3', '1:1', '3:4', '9:16'], frames: ['first_frame'],
    references: null, sound: true, autoAspect: false,
    rates: { '480p': 0.05, '720p': 0.10, '1080p': 0.20 },
  },
  'hailuo-3': {
    id: 'minimax/hailuo-3', label: 'Hailuo 3', note: '2K output',
    durations: span(5, 15), aspects: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], frames: BOTH_FRAMES,
    references: null, sound: true, autoAspect: false,
    rates: { '2K': 0.13 }, perFrameImage: 0.04,
  },
};

// rates: USD per image by size option. sizeParam: the request field the size
// option is sent as (`resolution` for most, `quality` for GPT Image).
// perReference: USD added per reference image.
export const IMAGE_MODELS = {
  'seedream-5-pro': {
    id: 'bytedance-seed/seedream-5-0-pro', label: 'Seedream 5 Pro', note: 'photo-real, accepts real-looking faces',
    sizeParam: 'resolution', aspects: SEEDREAM_ASPECTS, maxReferences: 14,
    rates: { '1K': 0.045, '2K': 0.09 }, perReference: 0.003,
  },
  'seedream-5-lite': {
    id: 'bytedance-seed/seedream-5-0-lite', label: 'Seedream 5 Lite', note: 'cheap 2K and 4K',
    sizeParam: 'resolution', aspects: SEEDREAM_ASPECTS, maxReferences: 14,
    rates: { '2K': 0.035, '4K': 0.035 }, perReference: 0,
  },
  'nano-banana-pro': {
    id: 'google/gemini-3-pro-image', label: 'Nano Banana Pro', note: 'precise edits and text in images',
    sizeParam: 'resolution', aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxReferences: 14,
    // Billed per output token: 1120 tokens at 1K/2K, 2000 at 4K, × $0.00012.
    rates: { '1K': 0.14, '2K': 0.14, '4K': 0.25 }, perReference: 0.002,
  },
  'nano-banana-2': {
    id: 'google/gemini-3.1-flash-image', label: 'Nano Banana 2', note: 'fast, cheap edits',
    sizeParam: 'resolution', aspects: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'], maxReferences: 14,
    // Billed per output token (1120 / 1680 / 2520) × $0.00006.
    rates: { '1K': 0.07, '2K': 0.11, '4K': 0.16 }, perReference: 0,
  },
  'gpt-image-2': {
    id: 'openai/gpt-image-2', label: 'GPT Image 2', note: 'follows complex prompts',
    sizeParam: 'quality', aspects: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9', 'auto'], maxReferences: 16,
    // Token-billed and quality-dependent; these are ceilings, not typical
    // charges (OpenRouter's own example: high quality 16:9 cost $0.13).
    rates: { low: 0.03, medium: 0.10, high: 0.30 }, perReference: 0.02,
  },
  'flux-3': {
    id: 'black-forest-labs/flux-3-image', label: 'Flux 3', note: 'artistic and photographic styles',
    sizeParam: 'resolution', aspects: ['21:9', '2:1', '16:9', '3:2', '4:3', '5:4', '1:1', '4:5', '3:4', '2:3', '9:16', '1:2', '9:21', 'auto'], maxReferences: 10,
    rates: { '1K': 0.048, '1.5K': 0.07, '2K': 0.10, '4K': 0.61 }, perReference: 0,
  },
};

export const VIDEO_DEFAULT = 'seedance-2.5';
export const IMAGE_DEFAULT = 'seedream-5-pro';

const round = (n) => Math.round(n * 1000) / 1000;

export function videoRate(model, resolution, sound = true) {
  const rate = model.rates[resolution];
  if (rate == null) return null;
  return !sound && model.sound ? (model.silent?.[resolution] ?? rate) : rate;
}

export function estimateVideoCost(taskType, { resolution, duration, sound = true, frameCount = 0 }) {
  const model = VIDEO_MODELS[taskType];
  const rate = model && videoRate(model, resolution, sound);
  if (rate == null) return null;
  return round(rate * duration + (model.perFrameImage || 0) * frameCount);
}

export function estimateImageCost(taskType, { size, referenceCount = 0 }) {
  const model = IMAGE_MODELS[taskType];
  const rate = model?.rates[size];
  if (rate == null) return null;
  return round(rate + model.perReference * referenceCount);
}

// What the browser needs to draw the controls: the lineup without OpenRouter
// internals, in display order.
export function catalogView() {
  const pick = (table) => Object.entries(table).map(([key, m]) => {
    const { id, ...rest } = m;
    return { key, ...rest, references: m.references && { ...m.references, total: Number.isFinite(m.references.total) ? m.references.total : null } };
  });
  return { video: pick(VIDEO_MODELS), image: pick(IMAGE_MODELS) };
}

// ---- live price check -------------------------------------------------------

const RES_TOKEN = /(480p|720p|768p|1080p|4k|2k|1\.5k|1k)/i;
// SKUs that aren't a plain per-second output price.
const NOT_PER_SECOND = /reference|continuation|minimum|image_input|video_tokens|video_input|megapixel/i;

// Highest per-second price a /videos/models entry quotes for one resolution,
// with or without sound. null when the model isn't priced per second.
export function livePerSecond(skus, resolution, sound) {
  let best = null;
  for (const [key, raw] of Object.entries(skus || {})) {
    if (NOT_PER_SECOND.test(key)) continue;
    if (sound && /without_audio/.test(key)) continue;
    if (!sound && /with_audio/.test(key)) continue;
    const res = key.match(RES_TOKEN)?.[1];
    if (res && res.toLowerCase() !== resolution.toLowerCase()) continue;
    let usd = Number(raw);
    if (!Number.isFinite(usd)) continue;
    if (/cents/.test(key)) usd /= 100;
    best = best == null ? usd : Math.max(best, usd);
  }
  return best;
}

function raise(table, key, value) {
  if (value != null && table[key] != null && value > table[key]) table[key] = round(value);
}

// Raise any rate that OpenRouter now quotes higher. Best effort: failures
// leave the built-in rates in place.
export async function refreshCatalog(fetchJson) {
  const changed = [];
  try {
    const { data } = await fetchJson('/videos/models');
    const byId = new Map((data || []).map((m) => [m.id, m]));
    for (const [key, model] of Object.entries(VIDEO_MODELS)) {
      const live = byId.get(model.id);
      if (!live) continue;
      for (const res of Object.keys(model.rates)) {
        const before = model.rates[res];
        raise(model.rates, res, livePerSecond(live.pricing_skus, res, true));
        if (model.silent) raise(model.silent, res, livePerSecond(live.pricing_skus, res, false));
        if (model.rates[res] !== before) changed.push(`${key} ${res}`);
      }
    }
  } catch { /* offline or catalog changed shape: keep built-in rates */ }
  await Promise.all(Object.entries(IMAGE_MODELS).map(async ([key, model]) => {
    try {
      const { endpoints } = await fetchJson(`/images/models/${model.id}/endpoints`);
      for (const ep of endpoints || []) {
        for (const line of ep.pricing || []) {
          if (line.unit !== 'image') continue;
          if (line.billable === 'input_image') {
            if (line.cost_usd > model.perReference) { model.perReference = line.cost_usd; changed.push(`${key} reference`); }
            continue;
          }
          if (line.billable !== 'output_image') continue;
          // A variant names one size ("2k"); no variant is the base price,
          // which every size costs at least.
          const sizes = line.variant
            ? Object.keys(model.rates).filter((s) => s.toLowerCase() === String(line.variant).toLowerCase())
            : Object.keys(model.rates);
          for (const s of sizes) {
            const before = model.rates[s];
            raise(model.rates, s, line.cost_usd);
            if (model.rates[s] !== before) changed.push(`${key} ${s}`);
          }
        }
      }
    } catch { /* keep built-in rates */ }
  }));
  return changed;
}
