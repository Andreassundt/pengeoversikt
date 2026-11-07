// Generates PNG icons from the SVG source. Run with `npm run icons`.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'icons');
mkdirSync(out, { recursive: true });

function svg({ padding, rounded }) {
  // A simple coin-with-chart mark on a teal background.
  const r = rounded ? 112 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${r}" fill="#0f766e"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - 2 * padding) / 512})">
    <circle cx="256" cy="256" r="150" fill="#f0fdfa"/>
    <circle cx="256" cy="256" r="122" fill="none" stroke="#0f766e" stroke-width="14"/>
    <path d="M176 300 L226 250 L262 282 L336 196" fill="none" stroke="#0f766e" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M296 196 H336 V236" fill="none" stroke="#0f766e" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const plain = svg({ padding: 0, rounded: true });
const maskable = svg({ padding: 72, rounded: false });

writeFileSync(path.join(root, 'public', 'favicon.svg'), plain);
const jobs = [
  ['icon-192.png', plain, 192],
  ['icon-512.png', plain, 512],
  ['apple-touch-icon.png', svg({ padding: 32, rounded: false }), 180],
  ['maskable-192.png', maskable, 192],
  ['maskable-512.png', maskable, 512],
];
for (const [name, source, size] of jobs) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(path.join(out, name));
  console.log('wrote', name);
}
