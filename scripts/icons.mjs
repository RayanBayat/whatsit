// Render assets/icon.svg to all PNG sizes the manifest and store need.
// Usage: npm run icons  (requires dev dep: sharp)

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
mkdirSync('extension/icons', { recursive: true });

for (const [size, src] of Object.entries(SOURCES)) {
  await sharp(src)
    .resize(+size, +size)
    .png()
    .toFile(`extension/icons/icon${size}.png`);
  console.log(`icon${size}.png ← ${src}`);
}
