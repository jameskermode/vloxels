// scripts/gen-icons.mjs — regenerate the PWA icons.
//   node scripts/gen-icons.mjs
// Draws a blocky "V" over a sky/ground scene (full-bleed, so it's maskable-safe)
// and writes PNGs into public/. No image libraries — a tiny PNG encoder using
// Node's built-in zlib.

import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';

// --- tiny PNG encoder (RGBA, 8-bit) ---------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// --- drawing --------------------------------------------------------------
const SKY = [142, 202, 255];
const GROUND = [106, 176, 76];
const VCOL = [255, 255, 255];
const COIN = [255, 210, 74];

// distance from point p to segment a-b, in normalised units
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function classify(u, v) {
  // a chunky "V"
  const dL = segDist(u, v, 0.28, 0.24, 0.5, 0.66);
  const dR = segDist(u, v, 0.72, 0.24, 0.5, 0.66);
  if (Math.min(dL, dR) < 0.085) return VCOL;
  // a coin dot up top-right
  if (Math.hypot(u - 0.78, v - 0.2) < 0.06) return COIN;
  return v > 0.72 ? GROUND : SKY;
}

function draw(size) {
  const N = 16; // blocky grid
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const i = Math.floor((px / size) * N);
      const j = Math.floor((py / size) * N);
      const u = (i + 0.5) / N;
      const v = (j + 0.5) / N;
      const [r, g, b] = classify(u, v);
      const o = (py * size + px) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  }
  return encodePNG(size, rgba);
}

for (const [name, size] of [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon-180x180.png', 180],
  ['favicon-48x48.png', 48],
]) {
  writeFileSync(`public/${name}`, draw(size));
  console.log(`wrote public/${name} (${size}px)`);
}
