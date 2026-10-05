import { VIDEO_MODES } from './openrouter.js';
import {
  VIDEO_MODELS, IMAGE_MODELS, VIDEO_DEFAULT, IMAGE_DEFAULT, estimateVideoCost, estimateImageCost,
} from './models.js';

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
    const task_type = body.task_type || IMAGE_DEFAULT;
    const model = IMAGE_MODELS[task_type];
    if (!model) {
      throw validationError(`task_type must be one of: ${Object.keys(IMAGE_MODELS).join(', ')}`);
    }
    const sizes = Object.keys(model.rates);
    const size = body.size || sizes[0];
    if (!sizes.includes(size)) {
      throw validationError(`size ${size} is not available for ${task_type} (${sizes.join(', ')})`);
    }
    const aspect_ratio = body.aspect_ratio || '1:1';
    if (!model.aspects.includes(aspect_ratio)) {
      throw validationError(`aspect_ratio for ${task_type} must be one of: ${model.aspects.join(', ')}`);
    }
    const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
    if (image_urls.length > model.maxReferences) {
      throw validationError(`at most ${model.maxReferences} image_urls for ${task_type}`);
    }
    return {
      kind, task_type, mode: null,
      params: { aspect_ratio, size, image_urls },
      payload: { model: model.id, prompt, aspect_ratio, [model.sizeParam]: size,
        ...(image_urls.length
          ? { input_references: image_urls.map((url) => ({ type: 'image_url', image_url: { url } })) }
          : {}) },
      cost: estimateImageCost(task_type, { size, referenceCount: image_urls.length }),
    };
  }

  // video
  const task_type = body.task_type || VIDEO_DEFAULT;
  const model = VIDEO_MODELS[task_type];
  if (!model) {
    throw validationError(`task_type must be one of: ${Object.keys(VIDEO_MODELS).join(', ')}`);
  }
  const mode = body.mode || 'text_to_video';
  if (!VIDEO_MODES.includes(mode)) {
    throw validationError(`mode must be one of: ${VIDEO_MODES.join(', ')}`);
  }
  if (mode === 'omni_reference' && !model.references) {
    throw validationError(`${task_type} takes start/end frames, not references; use a Seedance model for references`);
  }
  const { durations } = model;
  const duration = Number(body.duration ?? (durations.includes(5) ? 5 : durations[0]));
  if (!durations.includes(duration)) {
    const contiguous = durations.length === durations[durations.length - 1] - durations[0] + 1;
    throw validationError(contiguous
      ? `duration must be an integer between ${durations[0]} and ${durations[durations.length - 1]} for ${task_type}`
      : `duration must be one of ${durations.join(', ')} for ${task_type}`);
  }
  const resolutions = Object.keys(model.rates);
  const resolution = body.resolution || resolutions[0];
  if (!resolutions.includes(resolution)) {
    throw validationError(`resolution ${resolution} is not available for ${task_type} (${resolutions.join(', ')})`);
  }
  const sound = body.sound === undefined ? true : body.sound !== false;
  const aspect_ratio = body.aspect_ratio || (model.aspects.includes('16:9') ? '16:9' : model.aspects[0]);
  // 'auto' (match the first frame's shape) only makes sense with frames.
  const aspects = mode === 'first_last_frames' && model.autoAspect ? [...model.aspects, 'auto'] : model.aspects;
  if (!aspects.includes(aspect_ratio)) {
    throw validationError(`aspect_ratio for ${task_type} must be one of: ${model.aspects.join(', ')}`);
  }

  const image_urls = Array.isArray(body.image_urls) ? body.image_urls : [];
  const video_urls = Array.isArray(body.video_urls) ? body.video_urls : [];
  const audio_urls = Array.isArray(body.audio_urls) ? body.audio_urls : [];
  const totalRefs = image_urls.length + video_urls.length + audio_urls.length;
  if (mode === 'text_to_video' && totalRefs > 0) {
    throw validationError('text_to_video takes no reference URLs');
  }
  if (mode === 'omni_reference') {
    const lim = model.references;
    if (totalRefs === 0) throw validationError('omni_reference requires at least one reference URL');
    if (totalRefs > lim.total) throw validationError(`at most ${lim.total} total reference URLs`);
    if (image_urls.length > lim.image || video_urls.length > lim.video || audio_urls.length > lim.audio) {
      throw validationError(`reference limit exceeded for ${task_type}: ${lim.image} images, ${lim.video} videos, ${lim.audio} audios`);
    }
    if (task_type !== 'seedance-2.5' && audio_urls.length && !image_urls.length && !video_urls.length) {
      throw validationError('audio references require at least one image or video reference');
    }
  }
  if (mode === 'first_last_frames') {
    const maxFrames = model.frames.length;
    if (image_urls.length < 1 || image_urls.length > maxFrames) {
      throw validationError(maxFrames === 1
        ? `${task_type} takes a start frame only (1 image_url)`
        : 'first_last_frames requires 1-2 image_urls');
    }
    if (video_urls.length || audio_urls.length) {
      throw validationError('first_last_frames only accepts image_urls');
    }
  }
  const counts = { image: image_urls.length, video: video_urls.length, audio: audio_urls.length };
  for (const m of prompt.matchAll(REF_RE)) {
    const [, type, n] = m;
    if (Number(n) < 1 || Number(n) > counts[type]) {
      throw validationError(`prompt references @${type}${n} but only ${counts[type]} ${type} URL(s) provided`);
    }
  }

  const payload = { model: model.id, prompt, duration, resolution, aspect_ratio };
  if (model.sound) payload.generate_audio = sound;
  if (aspect_ratio === 'auto') delete payload.aspect_ratio;
  // Start/end frames go in frame_images (first upload = first frame), not
  // input_references — otherwise Seedance treats them as loose style refs.
  if (mode === 'first_last_frames') {
    payload.frame_images = image_urls.map((url, i) => ({
      type: 'image_url', image_url: { url }, frame_type: i === 0 ? 'first_frame' : 'last_frame',
    }));
  }
  const references = mode === 'first_last_frames' ? [] : [
    ...image_urls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ...video_urls.map((url) => ({ type: 'video_url', video_url: { url } })),
    ...audio_urls.map((url) => ({ type: 'audio_url', audio_url: { url } })),
  ];
  if (references.length) payload.input_references = references;
  if (webhookSecret && publicBaseUrl) payload.callback_url = `${publicBaseUrl}/api/webhook/openrouter?secret=${encodeURIComponent(webhookSecret)}`;
  return {
    kind, task_type, mode,
    params: { duration, resolution, aspect_ratio, ...(model.sound ? { sound } : {}), image_urls, video_urls, audio_urls },
    payload,
    cost: estimateVideoCost(task_type, {
      resolution, duration, sound, frameCount: mode === 'first_last_frames' ? image_urls.length : 0,
    }),
  };
}
