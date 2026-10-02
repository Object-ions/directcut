import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const mediaDir = path.join(__dirname, 'media');
export const refsDir = path.join(mediaDir, 'refs');
fs.mkdirSync(refsDir, { recursive: true });

const EXT_BY_TYPE = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};

// Download a (possibly expiring) remote URL into server/media/ under an
// unguessable uuid name. Returns the filename relative to mediaDir.
export async function downloadToMedia(url, kind) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (HTTP ${res.status}) for ${url}`);
  const fromUrl = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  const ext = fromUrl
    || EXT_BY_TYPE[(res.headers.get('content-type') || '').split(';')[0]]
    || (kind === 'video' ? 'mp4' : 'jpg');
  const name = `${crypto.randomUUID()}.${ext}`;
  const dest = path.join(mediaDir, name);
  try {
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  } catch (err) {
    fs.rmSync(dest, { force: true });
    throw err;
  }
  return name;
}

export async function responseToMedia(res, kind) {
  if (!res.ok) throw new Error(`media response failed (HTTP ${res.status})`);
  const type = (res.headers.get('content-type') || '').split(';')[0];
  const ext = EXT_BY_TYPE[type] || (kind === 'video' ? 'mp4' : 'png');
  const name = `${crypto.randomUUID()}.${ext}`;
  const dest = path.join(mediaDir, name);
  try { await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest)); }
  catch (err) { fs.rmSync(dest, { force: true }); throw err; }
  return name;
}

export function base64ToMedia(data, mediaType = 'image/png') {
  const ext = EXT_BY_TYPE[mediaType] || 'png';
  const name = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(mediaDir, name), Buffer.from(data, 'base64'));
  return name;
}

// Reference uploads are served from our own /media/refs/, which OpenRouter
// can't reach when Directcut runs on a laptop (localhost or no public URL).
// Images are inlined as base64 data URLs, which OpenRouter accepts. Video and
// audio refs must be public https URLs (OpenRouter rejects data URLs for
// them), so those only work when PUBLIC_BASE_URL is https. Anything that
// isn't one of our refs (a real https URL) passes through untouched.
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]));
MIME_BY_EXT.jpeg = 'image/jpeg';

export class RefNotReachableError extends Error {
  constructor() {
    super('Video and audio references need Directcut running at a public https address '
      + '(set PUBLIC_BASE_URL in server/.env). Image references work anywhere.');
    this.status = 400;
  }
}

const localRefName = (url) => /(?:^|\/)media\/refs\/([\w][\w.-]*)$/.exec(String(url).split(/[?#]/)[0])?.[1];

export function localRefToDataUrl(url, publicBaseUrl = '') {
  const name = localRefName(url);
  if (!name) return url;
  const file = path.join(refsDir, name);
  if (!fs.existsSync(file)) {
    throw Object.assign(new Error(`reference file is gone: ${name} (re-upload it)`), { status: 400 });
  }
  const mime = MIME_BY_EXT[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
  if (mime.startsWith('image/')) return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  if (/^https:\/\//.test(publicBaseUrl)) return `${publicBaseUrl}/media/refs/${name}`;
  throw new RefNotReachableError();
}

// Returns a copy of an OpenRouter payload with local refs made reachable.
export function inlineLocalRefs(payload, publicBaseUrl = '') {
  const inline = (list) => list?.map((ref) => {
    const key = Object.keys(ref).find((k) => k.endsWith('_url') && ref[k]?.url);
    return key ? { ...ref, [key]: { ...ref[key], url: localRefToDataUrl(ref[key].url, publicBaseUrl) } } : ref;
  });
  const out = { ...payload };
  if (out.input_references) out.input_references = inline(out.input_references);
  if (out.frame_images) out.frame_images = inline(out.frame_images);
  return out;
}
