// Reference model shared by the slots UI and generate().
//
// refs: [{ url, filename, type: 'image'|'video'|'audio', name, role }]
//   role is a video-only hint (character/style/motion/voice/ref) that decides
//   what gets written into the prompt; Seedance itself only sees the @tags.
// frames: { start: ref|null, end: ref|null } (video start/end frames)

export const TYPE_BY_EXT = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  mp4: 'video',
  mp3: 'audio', wav: 'audio',
};
export const ACCEPT = {
  image: '.jpg,.jpeg,.png,.webp',
  video: '.mp4',
  audio: '.mp3,.wav',
  any: '.jpg,.jpeg,.png,.webp,.mp4,.mp3,.wav',
};

export const fileType = (file) => TYPE_BY_EXT[file.name.split('.').pop().toLowerCase()] || null;

// Higgsfield-style roles for video references. `phrase(tag)` is what lands in
// the prompt when one is added; users can edit it freely afterwards.
export const VIDEO_ROLES = [
  { role: 'character', label: 'character', type: 'image', icon: '👤', phrase: (t) => `${t} as the main character` },
  { role: 'style', label: 'style', type: 'image', icon: '🎨', phrase: (t) => `in the visual style of ${t}` },
  { role: 'motion', label: 'motion', type: 'video', icon: '🎥', phrase: (t) => `with camera movement like ${t}` },
  { role: 'voice', label: 'voice', type: 'audio', icon: '🔊', phrase: (t) => `speaking the line in ${t}` },
];
export const roleInfo = (role) => VIDEO_ROLES.find((r) => r.role === role) || null;

export const IMAGE_REF_LIMIT = 10;
// ByteDance rejects video references below this pixel count (≈640×640).
export const MIN_VIDEO_REF_PIXELS = 407696;

// Assign @image1-style tags in order within each type.
export function tagRefs(refs) {
  const counters = { image: 0, video: 0, audio: 0 };
  return refs.map((r) => {
    counters[r.type] += 1;
    return { ...r, tag: `@${r.type}${counters[r.type]}` };
  });
}

// The tag the next ref of `type` will get.
export function nextTag(refs, type) {
  return `@${type}${refs.filter((r) => r.type === type).length + 1}`;
}

export function appendToPrompt(prompt, text) {
  const base = prompt.replace(/\s+$/, '');
  if (!base) return text;
  return /[.,;:!?]$/.test(base) ? `${base} ${text}` : `${base}, ${text}`;
}

// Removing a ref shifts the tags after it (@image3 → @image2), so rewrite the
// prompt to match: drop the removed ref's own phrase (if still verbatim), drop
// any stray mention of its tag, and renumber the rest.
export function promptAfterRemoval(prompt, refs, index) {
  const before = tagRefs(refs);
  const removed = before[index];
  const after = tagRefs(refs.filter((_, i) => i !== index));
  const map = {};
  before.forEach((r, i) => {
    if (i === index) return;
    const j = i < index ? i : i - 1;
    map[r.tag] = after[j].tag;
  });

  // Phrases are rebuilt from the ref's current tag, so this still matches
  // after earlier removals have renumbered it.
  let next = prompt;
  const phrase = roleInfo(removed.role)?.phrase(removed.tag);
  if (phrase) next = next.replace(`, ${phrase}`, '').replace(phrase, '');
  next = next.replace(/@(image|video|audio)(\d+)\b/g, (tag) => {
    if (tag === removed.tag) return '';
    return map[tag] || tag;
  });
  return next.replace(/ {2,}/g, ' ').replace(/^[\s,]+/, '').replace(/\s+,/g, ',');
}

// Mode follows what's attached: frames win, then references, else plain text.
export function videoMode(frames, refs) {
  if (frames.start) return 'first_last_frames';
  if (refs.length) return 'omni_reference';
  return 'text_to_video';
}

// Width × height of a local video file, read in the browser before upload.
export function videoSize(file) {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    const url = URL.createObjectURL(file);
    el.preload = 'metadata';
    el.onloadedmetadata = () => { resolve({ w: el.videoWidth, h: el.videoHeight }); URL.revokeObjectURL(url); };
    el.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    el.src = url;
  });
}
