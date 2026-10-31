import test from 'node:test';
import assert from 'node:assert/strict';
import { realpath as realpathCallback } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { crc32, createZip, directoryEntries } from '../tools/zip.js';
import { packageExtension } from '../tools/package.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const nativeRealpath = promisify(realpathCallback.native);

// Independent CRC and ZIP reader verify local records and the central directory.
function checksum(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let n = 0; n < 8; n++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
function readZip(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  let cursor = bytes.readUInt32LE(end + 16);
  assert.equal(cursor + bytes.readUInt32LE(end + 12), end);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    assert.equal(bytes.readUInt32LE(cursor), 0x02014b50);
    assert.equal(bytes.readUInt16LE(cursor + 10), 0);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const commentLength = bytes.readUInt16LE(cursor + 32);
    const name = bytes.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    const offset = bytes.readUInt32LE(cursor + 42);
    assert.equal(bytes.readUInt32LE(offset), 0x04034b50);
    assert.equal(bytes.readUInt16LE(offset + 6), 0x0800);
    const size = bytes.readUInt32LE(cursor + 24);
    assert.equal(bytes.readUInt32LE(cursor + 20), size);
    assert.equal(bytes.readUInt32LE(offset + 18), size);
    assert.equal(bytes.readUInt32LE(offset + 22), size);
    const localNameLength = bytes.readUInt16LE(offset + 26);
    assert.equal(bytes.toString('utf8', offset + 30, offset + 30 + localNameLength), name);
    const dataStart = offset + 30 + localNameLength + bytes.readUInt16LE(offset + 28);
    const data = bytes.subarray(dataStart, dataStart + size);
    assert.equal(checksum(data), bytes.readUInt32LE(cursor + 16), `CRC: ${name}`);
    assert.equal(checksum(data), bytes.readUInt32LE(offset + 14), `local CRC: ${name}`);
    assert.ok(!name.includes('\\') && !name.startsWith('/') && !name.split('/').includes('..'));
    entries.set(name, data);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  assert.equal(cursor, end);
  return entries;
}

test('ZIP writer uses standard CRC32 and reads Unicode/binary entries deterministically', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  const files = [{ name: 'LexiLoom/词典.txt', data: Buffer.from('语织') }, { name: 'LexiLoom/icon.bin', data: Buffer.from([0, 255, 1, 128]) }];
  const result = readZip(createZip(files));
  assert.equal(result.get('LexiLoom/词典.txt').toString(), '语织');
  assert.deepEqual(result.get('LexiLoom/icon.bin'), files[1].data);
  assert.deepEqual(createZip(files), createZip([...files].reverse()));
});

test('ZIP writer rejects traversal, Windows paths and ambiguous duplicate names', () => {
  for (const name of ['/absolute', '../escape', 'folder/../escape', 'C:/file', 'folder\\file', 'folder//file', 'x\0y']) assert.throws(() => createZip([{ name, data: Buffer.alloc(0) }]), /Unsafe/);
  assert.throws(() => createZip([{ name: 'a', data: Buffer.alloc(0) }, { name: 'A', data: Buffer.alloc(0) }]), /Duplicate/);
  assert.throws(() => createZip([{ name: 'é', data: Buffer.alloc(0) }, { name: 'e\u0301', data: Buffer.alloc(0) }]), /Duplicate/);
});

test('packaging works in a spaced path, reads version and excludes credentials/OS metadata', async t => {
  const root = await mkdtemp(join(tmpdir(), 'LexiLoom package with spaces '));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'extension/ui'), { recursive: true });
  await mkdir(join(root, 'extension/__MACOSX'), { recursive: true });
  await mkdir(join(root, 'bridge'), { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '2.4.6' }));
  await writeFile(join(root, 'extension/manifest.json'), JSON.stringify({ manifest_version: 3, version: '2.4.6' }));
  await writeFile(join(root, 'extension/ui/词典.txt'), '内容\n');
  await writeFile(join(root, 'extension/.env'), 'secret=do-not-package');
  await writeFile(join(root, 'extension/.env.production'), 'secret=do-not-package');
  await writeFile(join(root, 'extension/.DS_Store'), 'os metadata');
  await writeFile(join(root, 'extension/__MACOSX/fork'), 'os metadata');
  await writeFile(join(root, 'bridge/.env'), 'secret=bridge-only');
  const first = await packageExtension({ projectRoot: root, runCheck: false, log: () => {} });
  assert.equal(first.version, '2.4.6');
  assert.ok(first.archivePath.endsWith('LexiLoom-2.4.6-chrome.zip'));
  const bytes = await readFile(first.archivePath);
  const contents = readZip(bytes);
  assert.deepEqual([...contents.keys()], ['LexiLoom/manifest.json', 'LexiLoom/ui/词典.txt']);
  assert.ok(!bytes.includes(Buffer.from('secret=')));
  assert.equal((await stat(join(first.folder, 'manifest.json'))).isFile(), true);
  await utimes(join(root, 'extension/manifest.json'), new Date(0), new Date(0));
  const second = await packageExtension({ projectRoot: root, runCheck: false, log: () => {} });
  assert.deepEqual(await readFile(second.archivePath), bytes, 'mtimes must not affect the ZIP');
});

test('packaging rejects links to files outside the extension', { skip: process.platform === 'win32' ? 'Windows symlinks can require elevated privileges.' : false }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'lexiloom-symlink-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'extension'));
  await writeFile(join(root, 'outside.txt'), 'private');
  await symlink(join(root, 'outside.txt'), join(root, 'extension/linked.txt'));
  await assert.rejects(directoryEntries(join(root, 'extension')), /Symbolic links/);
});

async function directoryIdentity(path) {
  // Node's JS realpath leaves Windows 8.3 names (RUNNER~1) untouched, so the
  // long path and the short path of one temp directory compare as different.
  // The native call asks the OS for the final path. Drive-letter case still varies.
  let resolved = await nativeRealpath(path);
  if (process.platform === 'win32') resolved = resolved.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '').toLowerCase();
  return resolved;
}

test('Node launchers locate spaced project paths and load .env only for the bridge', async t => {
  const root = await mkdtemp(join(tmpdir(), 'LexiLoom launcher with spaces '));
  const canonicalRoot = await directoryIdentity(root);
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['scripts', 'tools', 'bridge']) await mkdir(join(root, directory));
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(root, 'scripts/start.js'), await readFile(new URL('../scripts/start.js', import.meta.url)));
  const mock = "import {writeFileSync} from 'node:fs'; writeFileSync(new URL('../received.json',import.meta.url),JSON.stringify({cwd:process.cwd(),configured:process.env.LEXILOOM_TEST_ONLY==='private-fixture'})); console.log('ready');\n";
  await writeFile(join(root, 'bridge/server.js'), mock);
  await writeFile(join(root, 'tools/preview-server.js'), mock);
  const env = { ...process.env };
  delete env.LEXILOOM_TEST_ONLY;
  const options = { cwd: tmpdir(), env };
  async function received() {
    const value = JSON.parse(await readFile(join(root, 'received.json'), 'utf8'));
    return { ...value, cwd: await directoryIdentity(value.cwd) };
  }
  await assert.rejects(execute(process.execPath, [join(root, 'scripts/start.js'), 'bridge'], options), error => error.code === 1 && error.stderr.includes('Missing bridge/.env'));
  await writeFile(join(root, 'bridge/.env'), 'LEXILOOM_TEST_ONLY=private-fixture\n');
  const bridge = await execute(process.execPath, [join(root, 'scripts/start.js'), 'bridge'], options);
  assert.deepEqual(await received(), { cwd: canonicalRoot, configured: true });
  assert.ok(!bridge.stdout.includes('private-fixture') && !bridge.stderr.includes('private-fixture'));
  await execute(process.execPath, [join(root, 'scripts/start.js'), 'preview'], options);
  assert.deepEqual(await received(), { cwd: canonicalRoot, configured: false });
  if (process.platform !== 'win32') {
    await writeFile(join(root, 'scripts/start-preview.sh'), await readFile(new URL('../scripts/start-preview.sh', import.meta.url)));
    await execute('sh', [join(root, 'scripts/start-preview.sh')], options);
    assert.deepEqual(await received(), { cwd: canonicalRoot, configured: false });
  }
});
