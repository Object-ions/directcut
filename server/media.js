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
