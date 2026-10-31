// Small code-native brand mark. No external fonts, image assets or dependencies.
import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const folder = fileURLToPath(new URL('../extension/icons/', import.meta.url));
await mkdir(folder, { recursive: true });
function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type), data = Buffer.concat([name, bytes]);
  const length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(data));
  return Buffer.concat([length, data, crc]);
}
const lineDistance = (x,y,ax,ay,bx,by) => {
  const t = Math.max(0, Math.min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2)));
  return Math.hypot(x-ax-t*(bx-ax), y-ay-t*(by-ay));
};
function pixel(x,y) {
  const qx = Math.abs(x-64)-39, qy = Math.abs(y-64)-39;
  if (Math.hypot(Math.max(qx,0), Math.max(qy,0))+Math.min(Math.max(qx,qy),0)>22) return [250,248,243,0];
  let color = [36,77,67,255];
  if ([[39,31,39,90],[39,90,93,90],[65,31,65,65],[65,65,93,65]].some(line=>lineDistance(x,y,...line)<3.8)) color=[250,248,243,255];
  if (lineDistance(x,y,88,30,88,42)<3.8) color=[199,139,92,255];
  return color;
}
for (const size of [16,48,128]) {
  const raw = Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const rgba=[0,0,0,0];
    for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++) {
      const value=pixel((x+(sx+.5)/4)*128/size,(y+(sy+.5)/4)*128/size);
      value.forEach((v,i)=>rgba[i]+=v/16);
    }
    const offset=y*(size*4+1)+1+x*4;
    rgba.forEach((v,i)=>raw[offset+i]=Math.round(v));
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  await writeFile(`${folder}icon${size}.png`,png);
}
console.log('Generated 16 / 48 / 128 px LexiLoom icons.');
