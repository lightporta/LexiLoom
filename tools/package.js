import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createZip, directoryEntries } from './zip.js';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

export async function packageExtension({ projectRoot = defaultRoot, runCheck = true, log = console.log } = {}) {
  if (runCheck) execFileSync(process.execPath, [join(projectRoot, 'tools/check.js')], { stdio: 'inherit' });
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version)) throw new Error('Invalid package version.');
  const entries = await directoryEntries(join(projectRoot, 'extension'), { prefix: 'LexiLoom' });
  if (!entries.some(entry => entry.name === 'LexiLoom/manifest.json')) throw new Error('Extension manifest is missing.');
  const archive = createZip(entries);
  const dist = join(projectRoot, 'dist');
  const folder = join(dist, 'LexiLoom');
  const archivePath = join(dist, `LexiLoom-${pkg.version}-chrome.zip`);
  await mkdir(dist, { recursive: true });
  await rm(folder, { recursive: true, force: true });
  for (const entry of entries) {
    const destination = join(dist, ...entry.name.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.data);
  }
  const temporary = `${archivePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, archive);
    await rm(archivePath, { force: true });
    await rename(temporary, archivePath);
  } finally { await rm(temporary, { force: true }); }
  log(`Packaged ${archivePath} (${archive.length} bytes, ${entries.length} files). Universal Chrome package for Windows, Linux and macOS; no server credentials.`);
  return { archivePath, folder, version: pkg.version, fileCount: entries.length, size: archive.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await packageExtension();
