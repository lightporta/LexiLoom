// Rebuild the checked-in offline converter. No code is downloaded at runtime.
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const version = '1.4.2';
const origin = `https://registry.npmjs.org/opencc-js/-/opencc-js-${version}.tgz`;
const integrity = 'EdcspgdROiCCZDM+jZR6Pa670xW+EW2QhctPBQ8gRjg6lrx4IHEl+2s+kt5izk/TkxVRgdWuFgaGkaEdIUfdaw==';
const folder = fileURLToPath(new URL('../extension/shared/chinese-data/', import.meta.url));
const response = await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Unable to fetch pinned OpenCC package: ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
if (createHash('sha512').update(archive).digest('base64') !== integrity) throw new Error('OpenCC archive integrity mismatch');
const tar = gunzipSync(archive);
const wanted = new Map([
  ['package/dist/esm/full.js', 'opencc.js'],
  ['package/LICENSE', 'LICENSE.opencc-js'],
  ['package/THIRD_PARTY_LICENSES.md', 'THIRD_PARTY_LICENSES.md'],
  ['package/LICENSES/Apache-2.0.txt', 'LICENSE.opencc-data']
]);
await mkdir(folder, { recursive: true });
const files = {};
for (let offset = 0; offset + 512 <= tar.length;) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.toString('utf8', 0, 100).replace(/\0.*$/, '');
  if (!name) break;
  const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/, '');
  const fullName = prefix ? `${prefix}/${name}` : name;
  const size = Number.parseInt(header.toString('ascii', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
  if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid OpenCC package archive');
  const destination = wanted.get(fullName);
  if (destination) {
    const bytes = tar.subarray(offset + 512, offset + 512 + size);
    await writeFile(`${folder}${destination}`, bytes);
    files[destination] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
if (Object.keys(files).length !== wanted.size) throw new Error('Pinned OpenCC package did not contain the expected files');
await writeFile(`${folder}ORIGIN.json`, JSON.stringify({ name: 'opencc-js', version, origin, integrity: `sha512-${integrity}`, license: 'MIT AND Apache-2.0', repository: 'https://github.com/nk2028/opencc-js', modified: false, files }, null, 2) + '\n');
console.log(`Vendored OpenCC ${version}: ${Object.keys(files).length} files with original licenses; no runtime network dependency.`);
