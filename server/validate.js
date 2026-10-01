import {
  estimateCost, RATES,
  VIDEO_TASK_TYPES, IMAGE_TASK_TYPES, VIDEO_MODES, VIDEO_ASPECT_RATIOS, IMAGE_ASPECT_RATIOS,
  MODELS,
} from './openrouter.js';

export function validationError(msg) {
  const err = new Error(msg);
  err.status = 400;
  return err;
}

const REF_RE = /@(image|video|audio)(\d+)/g;

// Validate a /api/generate body and build the OpenRouter payload + cost estimate.
// Throws 400-status errors with human-readable reasons. Pure except for the
// opts defaults (read from env), so it's directly unit-testable.
export function validateAndBuild(body, opts = {}) {
  const publicBaseUrl = opts.publicBaseUrl ?? (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const webhookSecret = opts.webhookSecret ?? process.env.WEBHOOK_SECRET;

  const kind = body.kind === 'image' ? 'image' : 'video';
  // When a client records an enhancement, `prompt` holds the original idea and
  // `enhanced_prompt` the text actually generated with (the before/after pair).
  const enhanced = typeof body.enhanced_prompt === 'string' ? body.enhanced_prompt.trim() : '';
  const prompt = enhanced || (typeof body.prompt === 'string' ? body.prompt.trim() : '');
  if (!prompt) throw validationError('prompt is required');
  if (prompt.length > 4000) throw validationError('prompt exceeds 4000 characters');

  if (kind === 'image') {
    const task_type = body.task_type || 'seedream-5-pro';
    if (!IMAGE_TASK_TYPES.includes(task_type)) {
      throw validationError(`task_type must be one of: ${IMAGE_TASK_TYPES.join(', ')}`);
    }
    const size = body.size || (task_type.includes('-pro') ? '1K' : '2K');
    if (!Object.hasOwn(RATES.image[task_type], size)) {
      throw validationError(`size ${size} is not available for ${task_type}`);
    }
    const aspect_ratio = body.aspect_ratio || '1:1';
    if (!IMAGE_ASPECT_RATIOS.includes(aspect_ratio)) {
      throw validationError(`aspect_ratio must be one of: ${IMAGE_ASPECT_RATIOS.join(', ')}`);
    }
    const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
    if (image_urls.length > 10) throw validationError('at most 10 image_urls');
    const input = { prompt, aspect_ratio, size };
    if (image_urls.length) input.image_urls = image_urls;
    return {
      kind, task_type, mode: null,
      params: { aspect_ratio, size, image_urls },
      payload: { model: MODELS[task_type], prompt, aspect_ratio, resolution: size,
        ...(image_urls.length ? { input_references: image_urls } : {}) },
      cost: estimateCost({ kind, task_type, size, referenceCount: image_urls.length }),
    };
  }

  // video
  const task_type = body.task_type || 'seedance-2.5';
  if (!VIDEO_TASK_TYPES.includes(task_type)) {
    throw validationError(`task_type must be one of: ${VIDEO_TASK_TYPES.join(', ')}`);
  }
  const mode = body.mode || 'text_to_video';
  if (!VIDEO_MODES.includes(mode)) {
    throw validationError(`mode must be one of: ${VIDEO_MODES.join(', ')}`);
  }
  const duration = Number(body.duration ?? 5);
  const maxDuration = task_type.startsWith('seedance-2.5') ? 30 : 15;
  if (!Number.isInteger(duration) || duration < 4 || duration > maxDuration) {
    throw validationError(`duration must be an integer between 4 and ${maxDuration} for ${task_type}`);
  }
  const resolution = body.resolution || '480p';
  const rate = estimateCost({ kind, task_type, resolution, duration });
  if (rate == null) {
    throw validationError(`resolution ${resolution} is not available for ${task_type}`);
  }
  const aspect_ratio = body.aspect_ratio || '16:9';
  if (!VIDEO_ASPECT_RATIOS.includes(aspect_ratio)) {
    throw validationError(`aspect_ratio must be one of: ${VIDEO_ASPECT_RATIOS.join(', ')}`);
  }

  const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
  const video_urls = Array.isArray(body.video_urls) ? body.video_urls : [];
  const audio_urls = Array.isArray(body.audio_urls) ? body.audio_urls : [];
  const totalRefs = image_urls.length + video_urls.length + audio_urls.length;
  const is25 = task_type.startsWith('seedance-2.5');
  if (!is25 && totalRefs > 12) throw validationError('at most 12 total reference URLs');
  const maxImages = 14;
  const maxVideos = is25 ? 10 : 9;
  const maxAudios = is25 ? 10 : 12;
  if (image_urls.length > maxImages || video_urls.length > maxVideos || audio_urls.length > maxAudios) {
    throw validationError(`reference limit exceeded for ${task_type}: ${maxImages} images, ${maxVideos} videos, ${maxAudios} audios`);
  }
  if (mode === 'text_to_video' && totalRefs > 0) {
    throw validationError('text_to_video takes no reference URLs');
  }
  if (mode === 'omni_reference' && totalRefs === 0) {
    throw validationError('omni_reference requires at least one reference URL');
  }
  if (mode === 'first_last_frames') {
    if (image_urls.length < 1 || image_urls.length > 2) {
      throw validationError('first_last_frames requires 1-2 image_urls');
    }
    if (video_urls.length || audio_urls.length) {
      throw validationError('first_last_frames only accepts image_urls');
    }
  }
  if (!is25 && audio_urls.length && !image_urls.length && !video_urls.length) {
    throw validationError('audio references require at least one image or video reference');
  }
  const counts = { image: image_urls.length, video: video_urls.length, audio: audio_urls.length };
  for (const m of prompt.matchAll(REF_RE)) {
    const [, type, n] = m;
    if (Number(n) < 1 || Number(n) > counts[type]) {
      throw validationError(`prompt references @${type}${n} but only ${counts[type]} ${type} URL(s) provided`);
    }
  }

  const references = [
    ...image_urls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ...video_urls.map((url) => ({ type: 'video_url', video_url: { url } })),
    ...audio_urls.map((url) => ({ type: 'audio_url', audio_url: { url } })),
  ];
  const payload = { model: MODELS[task_type], prompt, duration, resolution, aspect_ratio };
  if (references.length) payload.input_references = references;
  if (webhookSecret && publicBaseUrl) payload.callback_url = `${publicBaseUrl}/api/webhook/openrouter?secret=${encodeURIComponent(webhookSecret)}`;
  return {
    kind, task_type, mode,
    params: { duration, resolution, aspect_ratio, image_urls, video_urls, audio_urls },
    payload,
    cost: rate,
  };
}
