import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// DATA_DIR overrides the location (tests point it at a temp dir).
const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
// The settings table holds the OpenRouter key — keep the data dir owner-only
// (covers the WAL/SHM side files too).
try { fs.chmodSync(dataDir, 0o700); } catch { /* non-POSIX fs */ }

export const db = new Database(path.join(dataDir, 'directcut.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  provider TEXT,
  provider_task_id TEXT,
  kind TEXT,
  task_type TEXT,
  mode TEXT,
  prompt TEXT,
  enhanced_prompt TEXT,
  params_json TEXT,
  status TEXT,
  error TEXT,
  cost_estimate REAL,
  file_path TEXT,
  source TEXT,
  created_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_generations_provider_task_id ON generations (provider_task_id);
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations (status);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations (created_at);
`);

export const insertGeneration = db.prepare(`
  INSERT INTO generations (id, provider, provider_task_id, kind, task_type, mode, prompt, enhanced_prompt,
    params_json, status, error, cost_estimate, file_path, source, created_at, completed_at)
  VALUES (@id, @provider, @provider_task_id, @kind, @task_type, @mode, @prompt, @enhanced_prompt,
    @params_json, @status, @error, @cost_estimate, @file_path, @source, @created_at, @completed_at)
`);

export const getGeneration = db.prepare('SELECT * FROM generations WHERE id = ?');
export const deleteGeneration = db.prepare('DELETE FROM generations WHERE id = ?');
export const listByStatus = db.prepare('SELECT * FROM generations WHERE status = ?');
export const getByProviderTaskId = db.prepare('SELECT * FROM generations WHERE provider_task_id = ?');
export const listGenerations = db.prepare(
  'SELECT * FROM generations ORDER BY created_at DESC LIMIT ?'
);

export const todaySpend = db.prepare(`
  SELECT COALESCE(SUM(cost_estimate), 0) AS total
  FROM generations
  WHERE substr(created_at, 1, 10) = ? AND status != 'failed'
`);

export const stalePendingRows = db.prepare(`
  SELECT * FROM generations
  WHERE status IN ('queued', 'processing') AND provider = 'openrouter' AND provider_task_id IS NOT NULL AND created_at < ?
`);

export const countsByStatus = db.prepare(
  'SELECT status, COUNT(*) AS n FROM generations GROUP BY status'
);

export const allParamsJson = db.prepare(
  "SELECT params_json FROM generations WHERE params_json IS NOT NULL AND params_json LIKE '%/media/refs/%'"
);

// Atomic spend-cap check + insert: better-sqlite3 transactions are synchronous,
// so no second request can read the same "spent" total before this row lands.
export const reserveSpend = db.transaction((row, cap) => {
  const today = row.created_at.slice(0, 10);
  const spent = todaySpend.get(today).total;
  if (spent + row.cost_estimate > cap) return { ok: false, spent };
  insertGeneration.run(row);
  return { ok: true, spent };
});

export const updateStatus = db.prepare(`
  UPDATE generations SET status = @status, error = @error,
    cost_estimate = @cost_estimate, provider = @provider, provider_task_id = @provider_task_id,
    params_json = @params_json, file_path = @file_path, completed_at = @completed_at
  WHERE id = @id
`);

export function saveRow(row) {
  updateStatus.run({
    id: row.id,
    status: row.status,
    error: row.error ?? null,
    cost_estimate: row.cost_estimate ?? 0,
    provider: row.provider ?? 'openrouter',
    provider_task_id: row.provider_task_id ?? null,
    params_json: row.params_json ?? null,
    file_path: row.file_path ?? null,
    completed_at: row.completed_at ?? null,
  });
}
