// Run the API (watch mode) and the Vite dev server together — no extra deps,
// works on any platform. Ctrl+C stops both.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = [
  spawn(npm, ['run', 'dev'], { cwd: path.join(root, 'server'), stdio: 'inherit' }),
  spawn(npm, ['run', 'dev'], { cwd: path.join(root, 'web'), stdio: 'inherit' }),
];

function stop(code = 0) {
  for (const c of children) c.kill('SIGINT');
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
for (const c of children) {
  c.on('exit', (code) => {
    // If one side dies, take the other down too so failures are loud.
    stop(code ?? 1);
  });
}
