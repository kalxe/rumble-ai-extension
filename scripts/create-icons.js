// Generate proper PNG icons for the Chrome extension
// Uses raw PNG encoding (no external dependencies)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'icons');

// Colors
const BG_COLOR = [15, 25, 35];        // Dark blue-gray #0f1923
const ACCENT_COLOR = [0, 212, 170];    // Tether green #00d4aa
const RING_COLOR = [0, 160, 130, 60];  // Transparent ring

function createPNG(width, height, pixelData) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (image data)
  // Add filter byte (0 = None) before each row
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (width * 4 + 1) + 1 + x * 4;
      rawData[dstIdx] = pixelData[srcIdx];       // R
      rawData[dstIdx + 1] = pixelData[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixelData[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixelData[srcIdx + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Draw a filled circle
function fillCircle(pixels, w, cx, cy, r, color) {
  for (let y = Math.max(0, cy - r); y <= Math.min(pixels.length / (w * 4) - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        const idx = (y * w + x) * 4;
        const a = (color[3] !== undefined ? color[3] : 255) / 255;
        pixels[idx] = Math.round(pixels[idx] * (1 - a) + color[0] * a);
        pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - a) + color[1] * a);
        pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - a) + color[2] * a);
        pixels[idx + 3] = 255;
      }
    }
  }
}

// Draw a ring (circle outline)
function drawRing(pixels, w, cx, cy, r, thickness, color) {
  const rOuter = r + thickness / 2;
  const rInner = r - thickness / 2;
  for (let y = Math.max(0, cy - rOuter - 1); y <= Math.min(pixels.length / (w * 4) - 1, cy + rOuter + 1); y++) {
    for (let x = Math.max(0, cx - rOuter - 1); x <= Math.min(w - 1, cx + rOuter + 1); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= rOuter && dist >= rInner) {
        const idx = (y * w + x) * 4;
        const a = (color[3] !== undefined ? color[3] : 255) / 255;
        pixels[idx] = Math.round(pixels[idx] * (1 - a) + color[0] * a);
        pixels[idx + 1] = Math.round(pixels[idx + 1] * (1 - a) + color[1] * a);
        pixels[idx + 2] = Math.round(pixels[idx + 2] * (1 - a) + color[2] * a);
        pixels[idx + 3] = 255;
      }
    }
  }
}

// Draw rounded rectangle background
function fillRoundedRect(pixels, w, h, radius, color) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = false;
      // Check if inside rounded rect
      if (x >= radius && x < w - radius) inside = true;
      else if (y >= radius && y < h - radius) inside = true;
      else {
        // Check corners
        const corners = [
          [radius, radius],
          [w - radius - 1, radius],
          [radius, h - radius - 1],
          [w - radius - 1, h - radius - 1]
        ];
        for (const [cx, cy] of corners) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= radius * radius) {
            inside = true;
            break;
          }
        }
      }
      if (inside) {
        const idx = (y * w + x) * 4;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      }
    }
  }
}

// Draw the ₮ (Tether) symbol using geometric shapes
function drawTetherSymbol(pixels, w, cx, cy, size, color) {
  // Horizontal top bar
  const barWidth = Math.round(size * 0.8);
  const barHeight = Math.max(2, Math.round(size * 0.12));
  const barY = cy - Math.round(size * 0.4);
  
  for (let y = barY; y < barY + barHeight; y++) {
    for (let x = cx - Math.round(barWidth / 2); x <= cx + Math.round(barWidth / 2); x++) {
      if (x >= 0 && x < w && y >= 0 && y < pixels.length / (w * 4)) {
        const idx = (y * w + x) * 4;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      }
    }
  }
  
  // Second horizontal bar (slightly below, slightly shorter)
  const bar2Width = Math.round(size * 0.6);
  const bar2Y = barY + barHeight + Math.max(1, Math.round(size * 0.06));
  
  for (let y = bar2Y; y < bar2Y + barHeight; y++) {
    for (let x = cx - Math.round(bar2Width / 2); x <= cx + Math.round(bar2Width / 2); x++) {
      if (x >= 0 && x < w && y >= 0 && y < pixels.length / (w * 4)) {
        const idx = (y * w + x) * 4;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      }
    }
  }
  
  // Vertical bar (stem)
  const stemWidth = Math.max(2, Math.round(size * 0.14));
  const stemTop = bar2Y;
  const stemBottom = cy + Math.round(size * 0.45);
  
  for (let y = stemTop; y <= stemBottom; y++) {
    for (let x = cx - Math.round(stemWidth / 2); x <= cx + Math.round(stemWidth / 2); x++) {
      if (x >= 0 && x < w && y >= 0 && y < pixels.length / (w * 4)) {
        const idx = (y * w + x) * 4;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
        pixels[idx + 3] = 255;
      }
    }
  }
}

function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4); // RGBA
  
  // Fill transparent
  pixels.fill(0);
  
  // Draw rounded rectangle background
  const radius = Math.round(size * 0.18);
  fillRoundedRect(pixels, size, size, radius, BG_COLOR);
  
  const cx = Math.round(size / 2);
  const cy = Math.round(size / 2);
  
  if (size >= 48) {
    // Draw decorative rings for larger icons
    drawRing(pixels, size, cx, cy, Math.round(size * 0.37), 2, [0, 212, 170, 40]);
    drawRing(pixels, size, cx, cy, Math.round(size * 0.30), 2, [0, 212, 170, 60]);
  }
  
  // Draw Tether symbol
  const symbolSize = Math.round(size * 0.55);
  drawTetherSymbol(pixels, size, cx, cy, symbolSize, ACCENT_COLOR);
  
  return createPNG(size, size, Buffer.from(pixels));
}

// Generate all icon sizes
const sizes = [16, 48, 128];

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of sizes) {
  const png = generateIcon(size);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Generated icon${size}.png (${png.length} bytes)`);
}

console.log('\nAll icons generated successfully!');
