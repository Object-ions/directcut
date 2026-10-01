// Operator settings that can be managed from the UI instead of server/.env:
// the access password and the OpenRouter key. Environment variables always
// win, so existing .env-based deployments keep working unchanged.
import crypto from 'node:crypto';
import { db } from './db.js';

db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const putSetting = db.prepare(`
  INSERT INTO settings (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const dropSetting = db.prepare('DELETE FROM settings WHERE key = ?');

const read = (key) => getSetting.get(key)?.value ?? null;

export const MIN_PASSWORD_LENGTH = 8;

// ── OpenRouter key ────────────────────────────────────────────────────────

export function openrouterKey() {
  return process.env.OPENROUTER_API_KEY || read('openrouter_api_key') || null;
}

export function openrouterKeySource() {
  if (process.env.OPENROUTER_API_KEY) return 'env';
  return read('openrouter_api_key') ? 'ui' : null;
}

export function saveOpenrouterKey(key) {
  putSetting.run('openrouter_api_key', key);
}

export function removeOpenrouterKey() {
  dropSetting.run('openrouter_api_key');
}

export function maskKey(key) {
  if (!key) return null;
  return key.length <= 12 ? '••••' : `${key.slice(0, 8)}…${key.slice(-4)}`;
}

// ── Access password ───────────────────────────────────────────────────────
// APP_SECRET (env) takes precedence. Otherwise the password chosen during
// first-run setup is stored as a salted scrypt hash.

export function passwordSource() {
  if (process.env.APP_SECRET) return 'env';
  return read('password_hash') ? 'ui' : null;
}

export const setupRequired = () => passwordSource() === null;

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// scrypt is deliberately slow, and the UI polls every few seconds — remember
// recently verified keys (by SHA-256, never the plaintext) so each request
// doesn't pay for a fresh derivation.
let verified = new Set();
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function checkPassword(candidate) {
  if (!candidate) return false;
  if (process.env.APP_SECRET) return safeEqual(candidate, process.env.APP_SECRET);
  const stored = read('password_hash');
  if (!stored) return false;
  const d = digest(candidate);
  if (verified.has(d)) return true;
  const [, saltHex, hashHex] = stored.split('$');
  const actual = crypto.scryptSync(String(candidate), Buffer.from(saltHex, 'hex'), 32);
  const ok = crypto.timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
  if (ok) verified.add(d);
  return ok;
}

export function savePassword(password) {
  putSetting.run('password_hash', hashPassword(password));
  verified = new Set(); // old password stops working immediately
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// ── First-run setup code ──────────────────────────────────────────────────
// Setup from the same machine needs nothing extra. From anywhere else (a VPS
// reached over the network) the browser must also present this one-time code,
// which is printed in the server's terminal — so nobody who merely finds the
// URL can claim an unconfigured instance.

export const setupCode = crypto.randomBytes(4).toString('hex').toUpperCase();

export function checkSetupCode(candidate) {
  return safeEqual(String(candidate || '').trim().toUpperCase(), setupCode);
}
