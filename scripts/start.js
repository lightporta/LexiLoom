#!/usr/bin/env node
// Resolve from this file, so launching from a folder with spaces is safe.
// Runtime launchers never install packages or print environment file contents.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('LexiLoom requires Node.js 22 or newer.'); process.exit(1);
}
const mode = process.argv[2];
let args;
if (mode === 'bridge') {
  const environmentFile = join(root, 'bridge/.env');
  if (!existsSync(environmentFile)) {
    console.error('Missing bridge/.env. Copy bridge/.env.example to bridge/.env and configure it locally.');
    process.exit(1);
  }
  args = [`--env-file=${environmentFile}`, join(root, 'bridge/server.js')];
} else if (mode === 'preview') args = [join(root, 'tools/preview-server.js')];
else if (mode === 'package') args = [join(root, 'tools/package.js')];
else { console.error('Usage: node scripts/start.js bridge|preview|package'); process.exit(1); }
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false });
child.on('error', () => { console.error('Unable to start LexiLoom. Check your Node.js installation.'); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (!child.killed) child.kill(signal); });
