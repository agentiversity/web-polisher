// Regenerate the add-on's toolbar/listing icons as PNGs (pure Node, no deps).
// Design: blue rounded badge, three white text lines, amber sparkle — text
// being polished. Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
const SIZES = [16, 32, 48, 128];
const SS = 4; // supersample factor for smooth edges

// ---- tiny PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- palette ----
const C_BG_TOP = [96, 165, 250]; // #60a5fa
const C_BG_BOT = [37, 99, 235]; // #2563eb
const C_TEXT = [255, 255, 255];
const C_SPARK = [251, 191, 36]; // #fbbf24

// Text bars (normalized): [x0, y0, x1, y1] — the middle line is shorter.
const BARS = [
  [0.2, 0.4, 0.8, 0.485],
  [0.2, 0.535, 0.62, 0.62],
  [0.2, 0.67, 0.8, 0.755],
];
const BAR_R = (BARS[0][3] - BARS[0][1]) / 2; // 0.0425

const BADGE = [0.02, 0.02, 0.98, 0.98, 0.18];
const SPARK = [0.79, 0.24, 0.16, 0.05]; // cx, cy, outer R, inner r

function insideRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = px < x0 + r ? x0 + r : px > x1 - r ? x1 - r : px;
  const cy = py < y0 + r ? y0 + r : py > y1 - r ? y1 - r : py;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function insideStar(px, py, cx, cy, R, r) {
  // classic 4-point concave sparkle (8-gon)
  const pts = [
    [cx, cy - R],
    [cx + r, cy - r],
    [cx + R, cy],
    [cx + r, cy + r],
    [cx, cy + R],
    [cx - r, cy + r],
    [cx - R, cy],
    [cx - r, cy - r],
  ];
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function renderIcon(size) {
  const S = size * SS;
  const rgba = Buffer.alloc(S * S * 4);
  for (let py = 0; py < S; py++) {
    const ny = (py + 0.5) / S;
    for (let px = 0; px < S; px++) {
      const nx = (px + 0.5) / S;
      let r, g, b, a;
      if (insideRoundedRect(nx, ny, ...BADGE)) {
        const t = ny; // vertical gradient
        r = Math.round(C_BG_TOP[0] + (C_BG_BOT[0] - C_BG_TOP[0]) * t);
        g = Math.round(C_BG_TOP[1] + (C_BG_BOT[1] - C_BG_TOP[1]) * t);
        b = Math.round(C_BG_TOP[2] + (C_BG_BOT[2] - C_BG_TOP[2]) * t);
        a = 1;
      } else {
        r = g = b = a = 0;
      }
      if (a > 0) {
        for (const bar of BARS) {
          if (insideRoundedRect(nx, ny, bar[0], bar[1], bar[2], bar[3], BAR_R)) {
            [r, g, b] = C_TEXT;
            a = 0.95;
            break;
          }
        }
        if (insideStar(nx, ny, ...SPARK)) {
          [r, g, b] = C_SPARK;
          a = 1;
        }
      }
      const i = (py * S + px) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(a * 255);
    }
  }
  // average supersampled blocks down to the target size
  const out = Buffer.alloc(size * size * 4);
  const n = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = ((y * SS + sy) * S + x * SS + sx) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          a += rgba[i + 3];
        }
      }
      const idx = (y * size + x) * 4;
      out[idx] = Math.round(r / n);
      out[idx + 1] = Math.round(g / n);
      out[idx + 2] = Math.round(b / n);
      out[idx + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, out);
}

mkdirSync(OUT, { recursive: true });
for (const s of SIZES) writeFileSync(join(OUT, `${s}.png`), renderIcon(s));
console.log('wrote icons to', OUT);
