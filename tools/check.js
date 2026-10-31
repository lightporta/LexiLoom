import { readFile, readdir, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const extension = join(root, 'extension');
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]));
  return nested.flat();
}
const all = await files(extension);
for (const file of [...all.filter(file => file.endsWith('.js')), ...await files(join(root, 'bridge')), ...await files(join(root, 'tools')), ...await files(join(root, 'scripts'))].filter(file => file.endsWith('.js'))) execFileSync(process.execPath, ['--check', file]);
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.version, pkg.version);
assert.deepEqual(manifest.permissions, ['storage']);
const paths = [manifest.background.service_worker, manifest.action.default_popup, manifest.options_page, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(item => item.js)];
for (const path of paths) assert.ok((await stat(resolve(extension, path))).isFile(), `Missing manifest file: ${path}`);
for (const path of all.filter(file => file.endsWith('.html'))) {
  const html = await readFile(path, 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(html), 'MV3 extension pages cannot have inline scripts');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(match[1])) continue;
    await stat(resolve(path, '..', match[1]));
  }
}
assert.ok(!all.some(path => /(?:\.env|node_modules|\.test\.)/.test(path)));
console.log(`Checked ${all.length} extension files: syntax, Manifest V3, local references, version, CSP and permissions.`);
