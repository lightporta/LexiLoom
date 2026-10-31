// Deterministic ZIP32 with the "store" method: no OS ZIP tool or npm dependency.
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const UINT32_MAX = 0xffffffff;
const UTF8 = 0x0800;
const DOS_DATE = 0x0021; // 1980-01-01 00:00:00, independent of timezone and mtime.
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function crc32(data) {
  let checksum = UINT32_MAX;
  for (const byte of data) checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ UINT32_MAX) >>> 0;
}

function entryName(value) {
  if (typeof value !== 'string') throw new Error('ZIP entry name must be a string.');
  const name = value.normalize('NFC');
  if (!name || name.includes('\\') || name.includes('\0') || /^[A-Za-z]:/.test(name)
    || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe ZIP entry name: ${name}`);
  if (Buffer.byteLength(name) > 0xffff) throw new Error('ZIP entry name is too long.');
  return name;
}

function excluded(name) {
  return name.startsWith('.') || name === '__MACOSX' || name === 'node_modules';
}

export async function directoryEntries(directory, { prefix = '' } = {}) {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('ZIP source must be a real directory.');
  const output = [];
  async function visit(folder, parts) {
    const children = await readdir(folder, { withFileTypes: true });
    children.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const child of children) {
      if (excluded(child.name)) continue;
      const fullPath = join(folder, child.name);
      const nextParts = [...parts, child.name];
      if (child.isSymbolicLink()) throw new Error(`Symbolic links cannot be packaged: ${nextParts.join('/')}`);
      if (child.isDirectory()) await visit(fullPath, nextParts);
      else if (child.isFile()) output.push({ name: entryName([prefix, ...nextParts].filter(Boolean).join('/')), data: await readFile(fullPath) });
      else throw new Error(`Unsupported file type: ${nextParts.join('/')}`);
    }
  }
  await visit(directory, []);
  return output;
}

export function createZip(entries) {
  if (!Array.isArray(entries) || entries.length > 0xffff) throw new Error('ZIP32 supports at most 65535 files.');
  const names = new Set();
  const normalized = entries.map(entry => {
    const name = entryName(entry.name);
    const collisionKey = name.toLowerCase();
    if (names.has(collisionKey)) throw new Error(`Duplicate or case-colliding ZIP entry: ${name}`);
    names.add(collisionKey);
    const data = Buffer.from(entry.data);
    if (data.length > UINT32_MAX) throw new Error('ZIP32 file size exceeded.');
    return { name, data };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of normalized) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // Stable Unix-made marker, including on Windows.
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8, 8);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 * 0x10000) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    localParts.push(local, name, entry.data);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
    if (offset > UINT32_MAX) throw new Error('ZIP32 archive size exceeded.');
  }
  const central = Buffer.concat(centralParts);
  if (central.length > UINT32_MAX || offset + central.length + 22 > UINT32_MAX) throw new Error('ZIP32 archive size exceeded.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(normalized.length, 8);
  end.writeUInt16LE(normalized.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}
