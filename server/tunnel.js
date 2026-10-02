// Temporary public https for video/audio references on a local install.
//
// OpenRouter only accepts video and audio references as public https URLs, and
// a laptop has none. So when a request needs one, Directcut starts a tiny file
// server that serves ONLY the reference files of active jobs (nothing else:
// not the app, not the gallery, not the API), and points a free Cloudflare
// quick tunnel at it. Each share is released when its job completes or fails
// (or after SHARE_TTL_MS as a backstop); the tunnel stops once nothing is shared.
//
// Set REF_TUNNEL=off to disable (e.g. on a VPS with a real https PUBLIC_BASE_URL,
// where this module is never used anyway).
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import crypto from 'node:crypto';
import { refsDir } from './media.js';

const SHARE_TTL_MS = 30 * 60 * 1000;
const IDLE_STOP_MS = 60 * 1000;
const READY_TIMEOUT_MS = 40 * 1000;
const DNS_SETTLE_MS = 2000;
const MIME = { mp4: 'video/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const tunnelEnabled = () => process.env.REF_TUNNEL !== 'off';

const shares = new Map(); // share id -> { names: Set, timer }
let state = null; // { server, tunnel, baseUrl } once up
let starting = null; // in-flight start promise
let idleTimer = null;

// Every cloudflared child, tracked from spawn (not just once it's up), so a
// server stopped mid-startup can't leave an orphaned tunnel behind.
const children = new Set();
function track(tunnel) {
  children.add(tunnel.process);
  tunnel.process.once('exit', () => children.delete(tunnel.process));
}
function killChildren() {
  for (const child of children) child.kill('SIGKILL');
  children.clear();
}
process.once('exit', killChildren);

const isShared = (name) => [...shares.values()].some((s) => s.names.has(name));

function startFileServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/__directcut_ping') return res.end('ok');
    // Same /media/refs/<name> shape the main server uses, so ref URLs are built one way.
    const name = decodeURIComponent((req.url || '').split('?')[0].replace(/^\/(media\/refs\/)?/, ''));
    if (!/^[\w][\w.-]*$/.test(name) || !isShared(name)) {
      res.statusCode = 404;
      return res.end();
    }
    const file = path.join(refsDir, name);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream');
      res.setHeader('Content-Length', st.size);
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// Resolve through public DNS-over-HTTPS rather than this machine's resolver.
// Never query before cloudflared reports "connected" (plus a short pause):
// asking for the brand-new hostname too early gets an NXDOMAIN that resolvers
// cache for up to a minute. Alternating two providers means one stale
// negative answer can't stall the check.
const DOH = [
  (host) => `https://cloudflare-dns.com/dns-query?name=${host}&type=A`,
  (host) => `https://dns.google/resolve?name=${host}&type=A`,
];

async function resolvePublic(host, attempt) {
  const res = await fetch(DOH[attempt % DOH.length](host), {
    headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000),
  });
  const body = await res.json();
  return body.Answer?.find((a) => a.type === 1)?.data || null;
}

function pingVia(ip, baseUrl) {
  return new Promise((resolve) => {
    const req = https.get(`${baseUrl}/__directcut_ping`, {
      lookup: (_h, opts, cb) => (opts?.all ? cb(null, [{ address: ip, family: 4 }]) : cb(null, ip, 4)),
      timeout: 5000,
    }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

async function waitUntilReachable(baseUrl) {
  const host = new URL(baseUrl).host;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  await new Promise((r) => setTimeout(r, DNS_SETTLE_MS));
  for (let attempt = 0; Date.now() < deadline; attempt += 1) {
    try {
      const ip = await resolvePublic(host, attempt);
      if (ip && await pingVia(ip, baseUrl)) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('tunnel did not become reachable in time');
}

async function openTunnel(server) {
  const { Tunnel } = await import('cloudflared');
  const tunnel = Tunnel.quick(`http://127.0.0.1:${server.address().port}`);
  track(tunnel);
  try {
    const baseUrl = await new Promise((resolve, reject) => {
      let url = null;
      let connected = false;
      const timer = setTimeout(() => reject(new Error('cloudflared did not connect')), READY_TIMEOUT_MS);
      const done = () => { if (url && connected) { clearTimeout(timer); resolve(url); } };
      tunnel.once('url', (u) => { url = u.replace(/\/$/, ''); done(); });
      tunnel.once('connected', () => { connected = true; done(); });
      tunnel.once('error', (err) => { clearTimeout(timer); reject(err); });
      tunnel.once('exit', (code) => { clearTimeout(timer); reject(new Error(`cloudflared exited (${code})`)); });
    });
    await waitUntilReachable(baseUrl);
    return { tunnel, baseUrl };
  } catch (err) {
    tunnel.stop();
    throw err;
  }
}

async function start() {
  const { bin, install } = await import('cloudflared');
  if (!fs.existsSync(bin)) await install(bin);
  const server = await startFileServer();
  try {
    let opened;
    try {
      opened = await openTunnel(server);
    } catch (err) {
      // Quick tunnels occasionally come up slow; a fresh hostname usually works.
      console.error(`ref tunnel attempt failed (${err.message}), retrying once`);
      opened = await openTunnel(server);
    }
    const { tunnel, baseUrl } = opened;
    tunnel.on('exit', () => { if (state?.tunnel === tunnel) stop(); });
    console.log(`ref tunnel up: ${baseUrl}`);
    return { server, tunnel, baseUrl };
  } catch (err) {
    server.close();
    throw err;
  }
}

function stop() {
  if (!state) return;
  state.tunnel.stop();
  state.server.close();
  console.log('ref tunnel stopped');
  state = null;
}

function scheduleIdleStop() {
  clearTimeout(idleTimer);
  if (shares.size) return;
  idleTimer = setTimeout(() => { if (!shares.size) stop(); }, IDLE_STOP_MS);
  idleTimer.unref?.();
}

// Shares the given ref filenames publicly. Returns the https base URL that
// serves them (`${baseUrl}/media/refs/${name}`) and a release() to call when the job ends.
export async function shareRefs(names) {
  clearTimeout(idleTimer);
  const id = crypto.randomUUID();
  const timer = setTimeout(() => release(id), SHARE_TTL_MS);
  timer.unref?.();
  shares.set(id, { names: new Set(names), timer });
  try {
    if (!state) {
      starting = starting || start().finally(() => { starting = null; });
      state = await starting;
    }
  } catch (err) {
    release(id);
    throw Object.assign(new Error(`Couldn't open a temporary public link for video/audio references: ${err.message}`), { status: 502 });
  }
  return { baseUrl: state.baseUrl, release: () => release(id) };
}

function release(id) {
  const share = shares.get(id);
  if (!share) return;
  clearTimeout(share.timer);
  shares.delete(id);
  scheduleIdleStop();
}

// Shutdown: drop every share and kill any cloudflared, up or still starting.
export function stopTunnel() {
  for (const id of [...shares.keys()]) release(id);
  clearTimeout(idleTimer);
  stop();
  killChildren();
}
