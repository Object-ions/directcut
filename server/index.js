import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import fs from 'node:fs';
import {
  getGeneration, getByProviderTaskId, listGenerations, todaySpend,
  stalePendingRows, saveRow, deleteGeneration, listByStatus,
  allParamsJson, reserveSpend, countsByStatus,
} from './db.js';
import { mediaDir, refsDir, downloadToMedia, responseToMedia, base64ToMedia } from './media.js';
import { enhance, enhancerConfigured } from './enhance.js';
import {
  createTask, getTask, mapStatus, normalizeTask, downloadVideo, verifyKey, actualCost, RATES,
  VIDEO_MODES, VIDEO_ASPECT_RATIOS, IMAGE_ASPECT_RATIOS,
} from './openrouter.js';
import {
  openrouterKey, openrouterKeySource, saveOpenrouterKey, removeOpenrouterKey, maskKey,
  passwordSource, setupRequired, checkPassword, savePassword, validatePassword,
  setupCode, checkSetupCode,
} from './settings.js';
import { validateAndBuild, validationError } from './validate.js';

const PORT = Number(process.env.PORT || 3456);
// Localhost-only by default; set HOST=0.0.0.0 to accept LAN/remote traffic.
const HOST = process.env.HOST || '127.0.0.1';
const DAILY_SPEND_CAP = Number(process.env.DAILY_SPEND_CAP || 10);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
app.set('trust proxy', 1); // one TLS-terminating reverse proxy in front of us
app.use(express.json({ limit: '10mb' }));

// Request log — one line per API request (media/static stay quiet). Set
// LOG_FORMAT=json for machine-readable lines.
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const entry = {
      time: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip,
    };
    console.log(process.env.LOG_FORMAT === 'json'
      ? JSON.stringify(entry)
      : `${entry.time} ${entry.method} ${entry.path} ${entry.status} ${entry.ms}ms`);
  });
  next();
});

// Minimal fixed-window rate limiter (no deps). Two buckets: a broad one on all
// of /api, and a tight one counting only failed auth attempts — the shared
// secret is the whole security model, so brute-force must be expensive.
function makeLimiter({ windowMs, max }) {
  let windowStart = Date.now();
  let hits = new Map();
  const roll = () => {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      hits = new Map();
    }
  };
  return {
    take(key) {
      roll();
      const n = (hits.get(key) || 0) + 1;
      hits.set(key, n);
      return n <= max;
    },
    blocked(key) {
      roll();
      return (hits.get(key) || 0) >= max;
    },
  };
}
const apiLimiter = makeLimiter({ windowMs: 60 * 1000, max: 240 });        // 240 req/min/IP
const authFailLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10 }); // 10 bad keys / 15 min / IP

// CORS — only origins listed in ALLOWED_ORIGINS (a separately hosted SPA +
// localhost dev). Non-browser clients (agents, curl) send no Origin header
// and are unaffected.
app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-App-Key');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// "Local" means the TCP peer is this machine AND no proxy forwarded the
// request — a reverse proxy on the same box connects from loopback too, and
// a forwarded header from a direct remote client must not count.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLocal = (req) => LOOPBACK.has(req.socket.remoteAddress) && !req.get('X-Forwarded-For');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Auth on /api/* — the webhook validates its own secret, and /api/setup is
// the only thing reachable before a password exists.
app.use('/api', (req, res, next) => {
  if (!apiLimiter.take(req.ip)) {
    return res.status(429).json({ error: 'rate limit exceeded — slow down' });
  }
  if (req.path === '/webhook/openrouter' || req.path === '/setup') return next();
  if (setupRequired()) {
    return res.status(403).json({ error: 'first-run setup required', setup_required: true });
  }
  if (authFailLimiter.blocked(req.ip)) {
    return res.status(429).json({ error: 'too many failed auth attempts — try again later' });
  }
  if (checkPassword(req.get('X-App-Key') || '')) return next();
  authFailLimiter.take(req.ip);
  res.status(401).json({ error: 'unauthorized' });
});

// ── First-run setup ───────────────────────────────────────────────────────

app.get('/api/setup', (req, res) => {
  res.json({
    setup_required: setupRequired(),
    needs_code: !isLocal(req),
    openrouter_key_from_env: openrouterKeySource() === 'env',
  });
});

app.post('/api/setup', async (req, res, next) => {
  try {
    if (!setupRequired()) return res.status(409).json({ error: 'already set up' });
    if (authFailLimiter.blocked(req.ip)) {
      return res.status(429).json({ error: 'too many failed attempts — try again later' });
    }
    const { password, openrouter_key: key, setup_code: code } = req.body || {};
    if (!isLocal(req) && !checkSetupCode(code)) {
      authFailLimiter.take(req.ip);
      return res.status(400).json({ error: 'wrong setup code — it is printed in the server terminal' });
    }
    const problem = validatePassword(password);
    if (problem) return res.status(400).json({ error: problem });
    if (openrouterKeySource() !== 'env') {
      const trimmed = typeof key === 'string' ? key.trim() : '';
      if (!trimmed) return res.status(400).json({ error: 'paste your OpenRouter key' });
      await checkKeyOrThrow(trimmed);
      saveOpenrouterKey(trimmed);
    }
    savePassword(password);
    console.log('setup complete — password set from the browser');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── Settings (authenticated) ──────────────────────────────────────────────

async function checkKeyOrThrow(key) {
  try {
    await verifyKey(key);
  } catch {
    throw validationError('OpenRouter rejected that key — copy it again from openrouter.ai/keys');
  }
}

function settingsView() {
  const key = openrouterKey();
  return {
    openrouter: { configured: Boolean(key), source: openrouterKeySource(), masked: maskKey(key) },
    password: { source: passwordSource() },
    enhancer: enhancerConfigured(),
  };
}

app.get('/api/settings', (_req, res) => res.json(settingsView()));

app.put('/api/settings/openrouter-key', async (req, res, next) => {
  try {
    if (openrouterKeySource() === 'env') {
      return res.status(409).json({ error: 'the key is set by OPENROUTER_API_KEY in server/.env — change it there' });
    }
    const key = typeof req.body?.key === 'string' ? req.body.key.trim() : '';
    if (!key) throw validationError('key is required');
    await checkKeyOrThrow(key);
    saveOpenrouterKey(key);
    res.json(settingsView());
  } catch (err) {
    next(err);
  }
});

app.delete('/api/settings/openrouter-key', (_req, res) => {
  if (openrouterKeySource() === 'env') {
    return res.status(409).json({ error: 'the key is set by OPENROUTER_API_KEY in server/.env — remove it there' });
  }
  removeOpenrouterKey();
  res.json(settingsView());
});

app.put('/api/settings/password', (req, res) => {
  if (passwordSource() === 'env') {
    return res.status(409).json({ error: 'the password is set by APP_SECRET in server/.env — change it there' });
  }
  const { current, next: nextPassword } = req.body || {};
  // 400, not 401: a 401 would sign the browser out mid-form.
  if (!checkPassword(current)) return res.status(400).json({ error: 'current password is wrong' });
  const problem = validatePassword(nextPassword);
  if (problem) return res.status(400).json({ error: problem });
  savePassword(nextPassword);
  res.json({ ok: true });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve the built SPA at / — one origin for UI + API. Refresh with:
// npm run build
const webDist = new URL('../web/dist', import.meta.url).pathname;
app.use(express.static(webDist));

// Public-read media; filenames are unguessable uuids. nosniff + an explicit
// Content-Disposition because /media is same-origin with the SPA (which holds
// the app key in sessionStorage) — a mislabeled file must never run as HTML.
const INLINE_MEDIA = /\.(mp4|mov|webm|jpe?g|png|webp|gif|mp3|wav)$/i;
app.use('/media', express.static(mediaDir, {
  fallthrough: false,
  index: false,
  setHeaders: (res, filePath) => {
    res.set('X-Content-Type-Options', 'nosniff');
    const disposition = INLINE_MEDIA.test(filePath) ? 'inline' : 'attachment';
    res.set('Content-Disposition', `${disposition}; filename="${path.basename(filePath)}"`);
  },
}));

// Attach a public URL for completed local files, or the (expiring) remote URL meanwhile.
function publicView(row) {
  const params = row.params_json ? JSON.parse(row.params_json) : {};
  let url = null;
  if (row.file_path) url = `${PUBLIC_BASE_URL}/media/${row.file_path}`;
  else if (params._output_urls?.length) url = params._output_urls[0];
  const { _output_urls, ...cleanParams } = params;
  return { ...row, params_json: undefined, params: cleanParams, url };
}

// Merge fresh OpenRouter task state into our row and persist the output locally.
async function syncRowFromTask(row, task) {
  const normalized = normalizeTask(task, row.kind);
  const status = mapStatus(normalized.status);
  row.status = status;
  row.provider_task_id = normalized.id || row.provider_task_id;
  const cost = actualCost(normalized);
  if (cost != null) row.cost_estimate = cost; // the real charge replaces the estimate
  if (status === 'failed') {
    row.error = normalized.error?.message || JSON.stringify(normalized.error || 'unknown OpenRouter failure');
  }
  const firstCompletion = status === 'completed' && !row.completed_at;
  if (status === 'completed') {
    const urls = normalized.urls || [];
    const params = row.params_json ? JSON.parse(row.params_json) : {};
    params._output_urls = urls;
    row.params_json = JSON.stringify(params);
    row.completed_at = row.completed_at || new Date().toISOString();
    if (!row.file_path && row.kind === 'image' && normalized.images?.length) {
      const image = normalized.images[0];
      row.file_path = base64ToMedia(image.b64_json, image.media_type || 'image/png');
      row.error = null;
    } else if (!row.file_path && row.kind === 'video' && row.provider_task_id) {
      try {
        row.file_path = await responseToMedia(await downloadVideo(row.provider_task_id), 'video');
        row.error = null;
      } catch (err) {
        row.error = `media download failed: ${err.message}`;
      }
    } else if (!row.file_path && urls.length) {
      try {
        row.file_path = await downloadToMedia(urls[0], row.kind);
        row.error = null;
      } catch (err) {
        // Keep the row completed but surface the miss; remote URL stays in params.
        row.error = `media download failed: ${err.message}`;
        console.error(`download for ${row.id} failed:`, err.message);
      }
    }
  }
  saveRow(row);
  if (firstCompletion && row.file_path && process.env.COMPLETION_WEBHOOK_URL) {
    notifyCompletion(row);
  }
  return row;
}

// Fire-and-forget POST to COMPLETION_WEBHOOK_URL on first completion (cloud
// archiving, n8n/Zapier flows, ...). Never blocks or fails the sync path.
function notifyCompletion(row) {
  const ext = path.extname(row.file_path);
  const slug = (row.prompt || 'untitled').replace(/[^\w ,'-]/g, '').trim().slice(0, 60);
  fetch(process.env.COMPLETION_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: row.id,
      kind: row.kind,
      prompt: row.prompt,
      url: `${PUBLIC_BASE_URL}/media/${row.file_path}`,
      filename: row.file_path,
      suggested_filename: `${(row.completed_at || '').slice(0, 10)} ${slug}${ext}`,
      cost_estimate: row.cost_estimate,
      source: row.source,
      created_at: row.created_at,
    }),
  }).catch((err) => console.error(`completion webhook failed for ${row.id}:`, err.message));
}

app.post('/api/generate', async (req, res, next) => {
  try {
    const built = validateAndBuild(req.body || {}, { publicBaseUrl: PUBLIC_BASE_URL });

    const row = {
      id: crypto.randomUUID(),
      provider: 'openrouter',
      provider_task_id: null,
      kind: built.kind,
      task_type: built.task_type,
      mode: built.mode,
      prompt: req.body.prompt,
      enhanced_prompt: req.body.enhanced_prompt || null,
      params_json: JSON.stringify(built.params),
      status: 'queued',
      error: null,
      cost_estimate: built.cost,
      file_path: null,
      source: typeof req.body.source === 'string' && /^[a-z0-9_-]{1,32}$/i.test(req.body.source)
        ? req.body.source
        : 'web',
      created_at: new Date().toISOString(),
      completed_at: null,
    };

    // Cap check + insert are one synchronous SQLite transaction, so two
    // concurrent requests can't both read the same total and both pass.
    const reserved = reserveSpend(row, DAILY_SPEND_CAP);
    if (!reserved.ok) {
      return res.status(429).json({
        error: `daily spend cap reached ($${reserved.spent.toFixed(2)} spent + $${built.cost.toFixed(3)} > $${DAILY_SPEND_CAP})`,
      });
    }

    try {
      const task = await createTask(built.payload, built.kind);
      await syncRowFromTask(row, task);
    } catch (err) {
      row.status = 'failed';
      row.error = err.message;
      saveRow(row);
      return res.status(502).json({ id: row.id, status: 'failed', error: err.message });
    }

    res.json({ id: row.id, status: row.status, cost_estimate: row.cost_estimate });
  } catch (err) {
    next(err);
  }
});

// OpenRouter callback: validate our secret, then re-fetch provider state.
app.post('/api/webhook/openrouter', async (req, res) => {
  const payload = req.body || {};
  const secret = req.query.secret || req.get('x-webhook-secret') || '';
  if (!process.env.WEBHOOK_SECRET || !safeEqual(secret, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'bad webhook secret' });
  }
  const taskId = payload.id || payload.job_id;
  const row = taskId ? getByProviderTaskId.get(taskId) : null;
  if (!row) return res.json({ ok: true, ignored: true });
  if (row.status === 'completed' && row.file_path) return res.json({ ok: true });
  try {
    const task = await getTask(taskId);
    await syncRowFromTask(row, task);
  } catch (err) {
    console.error(`webhook sync ${row.id} failed:`, err.message);
  }
  res.json({ ok: true });
});

// Reference uploads (images/video/audio attached to prompts).
const ALLOWED_UPLOAD = /\.(jpe?g|png|webp|mp4|mp3|wav)$/i;
const upload = multer({
  storage: multer.diskStorage({
    destination: refsDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_UPLOAD.test(file.originalname)) return cb(null, true);
    cb(validationError('only jpg, png, webp, mp4, mp3, wav files are accepted'));
  },
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) throw validationError('no file provided (multipart field name: "file")');
  res.json({
    filename: req.file.filename,
    url: `${PUBLIC_BASE_URL}/media/refs/${req.file.filename}`,
  });
});

// Prompt enhancement — separate from generation; never auto-generates.
// Runs through the same OpenRouter key; 501 until one is configured.
app.post('/api/enhance', async (req, res, next) => {
  if (!enhancerConfigured()) {
    return res.status(501).json({ error: 'enhancer not configured' });
  }
  try {
    const idea = typeof req.body?.idea === 'string' ? req.body.idea.trim() : '';
    if (!idea) throw validationError('idea is required');
    const enhanced_prompt = await enhance({
      idea,
      kind: req.body.kind === 'image' ? 'image' : 'video',
      mode: VIDEO_MODES.includes(req.body.mode) ? req.body.mode : 'text_to_video',
      refs: req.body.refs || {},
    });
    res.json({ enhanced_prompt });
  } catch (err) {
    next(err);
  }
});

app.get('/api/tasks/:id', async (req, res, next) => {
  try {
    let row = getGeneration.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'not found' });
    const terminal = row.status === 'completed' || row.status === 'failed';
    if (!terminal && row.provider_task_id) {
      try {
        const task = await getTask(row.provider_task_id);
        row = await syncRowFromTask(row, task);
      } catch (err) {
        console.error(`poll ${row.id} failed:`, err.message);
      }
    }
    res.json(publicView(row));
  } catch (err) {
    next(err);
  }
});

// Ops surface: today's spend vs. cap, row counts, media disk usage.
function dirSize(dir) {
  let bytes = 0;
  let files = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = dirSize(abs);
      bytes += sub.bytes;
      files += sub.files;
    } else if (entry.isFile()) {
      try {
        bytes += fs.statSync(abs).size;
        files += 1;
      } catch { /* raced a delete; skip */ }
    }
  }
  return { bytes, files };
}

app.get('/api/stats', (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const media = dirSize(mediaDir);
  const counts = {};
  for (const { status, n } of countsByStatus.all()) counts[status] = n;
  res.json({
    today: {
      date: today,
      spent: Math.round(todaySpend.get(today).total * 1000) / 1000,
      cap: DAILY_SPEND_CAP,
    },
    generations: counts,
    media: { files: media.files, bytes: media.bytes, human: `${(media.bytes / 1e6).toFixed(1)} MB` },
    uptime_s: Math.round(process.uptime()),
  });
});

// Server-authoritative pricing — the client fetches this instead of trusting
// its baked-in copy (which is only a fallback for the pre-fetch render).
app.get('/api/rates', (_req, res) => {
  res.json({
    video: RATES.video,
    image: RATES.image,
    video_modes: VIDEO_MODES,
    video_aspect_ratios: VIDEO_ASPECT_RATIOS,
    image_aspect_ratios: IMAGE_ASPECT_RATIOS,
  });
});

app.get('/api/generations', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  res.json(listGenerations.all(limit).map(publicView));
});

// file_path is stored relative to media/; resolve + prefix-check so a
// corrupted row can never unlink anything outside the media dir.
function removeMediaFile(row) {
  if (!row.file_path) return;
  const abs = path.resolve(mediaDir, row.file_path);
  if (!abs.startsWith(path.resolve(mediaDir) + path.sep)) return;
  fs.rmSync(abs, { force: true });
}

app.delete('/api/generations', (req, res) => {
  if (req.query.status !== 'failed') {
    return res.status(400).json({ error: 'bulk delete supports only ?status=failed' });
  }
  const rows = listByStatus.all('failed');
  for (const row of rows) {
    removeMediaFile(row);
    deleteGeneration.run(row.id);
  }
  res.json({ deleted: rows.length });
});

app.delete('/api/generations/:id', (req, res) => {
  const row = getGeneration.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  removeMediaFile(row);
  deleteGeneration.run(row.id);
  res.json({ deleted: true, id: row.id });
});

// SPA fallback: any unmatched GET outside /api, /media, /health gets index.html.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/media') || req.path === '/health') {
    return next();
  }
  res.sendFile(path.join(webDist, 'index.html'));
});

app.use((err, _req, res, _next) => {
  const status = err.status || (err instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message });
});

// Fallback poller — catches generations whose webhook never arrived. Rows
// older than POLL_MAX_AGE_HOURS are failed instead of being polled forever
// (a task OpenRouter never resolves would otherwise cost an API call every minute
// in perpetuity).
const POLL_MAX_AGE_HOURS = Number(process.env.POLL_MAX_AGE_HOURS || 24);
async function pollStaleRows() {
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const ceiling = new Date(Date.now() - POLL_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString();
  for (const row of stalePendingRows.all(cutoff)) {
    if (row.created_at < ceiling) {
      row.status = 'failed';
      row.error = `timed out: no result from OpenRouter within ${POLL_MAX_AGE_HOURS}h (task ${row.provider_task_id})`;
      saveRow(row);
      console.error(`gave up on ${row.id}: ${row.error}`);
      continue;
    }
    try {
      const task = await getTask(row.provider_task_id);
      await syncRowFromTask(row, task);
    } catch (err) {
      console.error(`fallback poll ${row.id} failed:`, err.message);
    }
  }
}
setInterval(() => pollStaleRows().catch((e) => console.error('poller crashed:', e)), 60 * 1000);

// Orphan-ref sweep — reference uploads live in media/refs/ but are only ever
// pointed at by generation params. Policy (documented in the README): a refs
// file no generation references, older than 24h, is deleted. Runs hourly.
const REF_RETENTION_MS = 24 * 60 * 60 * 1000;
function sweepOrphanRefs() {
  const referenced = new Set();
  for (const { params_json } of allParamsJson.all()) {
    for (const m of params_json.matchAll(/\/media\/refs\/([\w][\w.-]*)/g)) referenced.add(m[1]);
  }
  const cutoff = Date.now() - REF_RETENTION_MS;
  let removed = 0;
  for (const name of fs.readdirSync(refsDir)) {
    const abs = path.join(refsDir, name);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isFile() && st.mtimeMs < cutoff && !referenced.has(name)) {
      fs.rmSync(abs, { force: true });
      removed += 1;
    }
  }
  if (removed) console.log(`orphan sweep: removed ${removed} unreferenced ref upload(s)`);
}
setInterval(() => {
  try {
    sweepOrphanRefs();
  } catch (e) {
    console.error('orphan sweep crashed:', e);
  }
}, 60 * 60 * 1000);

app.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`directcut listening on http://${shown}:${PORT}`);
  if (setupRequired()) {
    console.log('');
    console.log(`  First run: open http://${shown}:${PORT} to choose a password and add your OpenRouter key.`);
    console.log(`  Setting up from another machine? It will ask for this code: ${setupCode}`);
    console.log('');
  }
});
