// Loaded via `node --import` before every test file: point the SQLite
// database at a throwaway directory so tests never touch server/data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'directcut-test-'));
delete process.env.APP_SECRET;
delete process.env.OPENROUTER_API_KEY;
