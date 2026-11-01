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
  const sourceEntries = await directoryEntries(join(projectRoot, 'extension'));
  if (!sourceEntries.some(entry => entry.name === 'manifest.json')) throw new Error('Extension manifest is missing.');
  const entries = sourceEntries.map(entry => ({ ...entry, name: `LexiLoom/${entry.name}` }));
  const archive = createZip(entries);
  const storeArchive = createZip(sourceEntries);
  const dist = join(projectRoot, 'dist');
  const folder = join(dist, 'LexiLoom');
  const archivePath = join(dist, `LexiLoom-${pkg.version}-chrome.zip`);
  const storeArchivePath = join(dist, `LexiLoom-${pkg.version}-store.zip`);
  await mkdir(dist, { recursive: true });
  await rm(folder, { recursive: true, force: true });
  for (const entry of entries) {
    const destination = join(dist, ...entry.name.split('/'));
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, entry.data);
  }
  for (const [destination, bytes] of [[archivePath, archive], [storeArchivePath, storeArchive]]) {
    const temporary = `${destination}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, bytes);
      await rm(destination, { force: true });
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  log(`Packaged ${archivePath} (${archive.length} bytes, ${entries.length} files). Universal Chrome package for Windows, Linux and macOS; no server credentials.`);
  log(`Packaged ${storeArchivePath} (${storeArchive.length} bytes). Chrome Web Store layout with manifest.json at the archive root; nothing has been uploaded.`);
  return { archivePath, storeArchivePath, folder, version: pkg.version, fileCount: entries.length, size: archive.length, storeSize: storeArchive.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await packageExtension();
