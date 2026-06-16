// Render assets/icon.svg to all PNG sizes. Output goes to public/icon/<size>.png,
// where WXT auto-detects them and wires up manifest `icons` + `action`.
// Usage: npm run icons  (dev dep: sharp)

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

// Small sizes use the simplified mark — the full design turns to mush below 48px.
const SOURCES = {
  16: 'assets/icon-small.svg',
  24: 'assets/icon-small.svg',
  32: 'assets/icon-small.svg',
  48: 'assets/icon.svg',
  128: 'assets/icon.svg',
};
mkdirSync('public/icon', { recursive: true });

for (const [size, src] of Object.entries(SOURCES)) {
  await sharp(src)
    .resize(+size, +size)
    .png()
    .toFile(`public/icon/${size}.png`);
  console.log(`public/icon/${size}.png ← ${src}`);
}
