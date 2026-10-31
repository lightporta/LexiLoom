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
const locales = ['zh_CN', 'en'];
const catalogs = Object.fromEntries(await Promise.all(locales.map(async name => [name, JSON.parse(await readFile(join(extension, '_locales', name, 'messages.json'), 'utf8'))])));
const zhKeys = Object.keys(catalogs.zh_CN).sort();
assert.deepEqual(zhKeys, Object.keys(catalogs.en).sort(), 'Locale catalogs must use the same message keys.');
assert.equal(manifest.default_locale, 'zh_CN');
const placeholders = value => [...String(value?.message || '').matchAll(/\$\d+/g)].map(item => item[0]).join(',');
for (const key of zhKeys) {
  assert.match(key, /^[A-Za-z0-9_]+$/, key);
  for (const name of locales) {
    assert.equal(typeof catalogs[name][key].message, 'string', key);
    assert.ok(catalogs[name][key].message.trim(), `${name} ${key}`);
  }
  assert.equal(placeholders(catalogs.zh_CN[key]), placeholders(catalogs.en[key]), key);
}
const used = new Set();
for (const file of all.filter(item => item.endsWith('.js') || item.endsWith('.html'))) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/data-i18n(?:-aria|-title)?="([A-Za-z0-9_]+)"/g)) used.add(match[1]);
  for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_]+)["']/g)) used.add(match[1]);
}
for (const key of ['providerSmart', 'providerWiktionary', 'providerFree', 'providerDemo', 'providerOxford', 'providerCambridge', 'noteSmart', 'noteWiktionary', 'noteFree', 'noteDemo', 'noteOxford', 'noteCambridge', 'source_wiktionary', 'source_free', 'source_demo', 'source_oxford', 'source_cambridge', 'source_smart', 'noticeWiktMissing', 'noticeWiktDown', 'noticeUnconfirmed', 'noticeBothDown', 'noticeFreeDown', 'noticeNoEnglish']) used.add(key);
for (const code of ['disabled', 'not_configured', 'bridge_auth', 'busy', 'bridge_busy', 'bridge_unavailable', 'invalid_word', 'unsupported_format', 'authentication', 'rate_limit', 'upstream', 'invalid_dictionary', 'integration', 'timeout', 'network', 'demo_miss', 'connection_failed', 'generic', 'missing_token', 'http_status', 'bridge_down']) used.add(`error_${code}`);
for (const match of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(match[1]);
for (const key of used) assert.ok(catalogs.zh_CN[key], `Missing message ${key}`);
console.log(`Checked ${all.length} extension files: syntax, Manifest V3, local references, version, CSP and permissions.`);
