/**
 * Generates PWA icons in public/ from src/assets/lab_logo.png.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'assets', 'lab_logo.png');
const outDir = path.join(root, 'public');

const white = { r: 255, g: 255, b: 255, alpha: 1 };

async function writeIcon(size, filename) {
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: white })
    .png()
    .toFile(path.join(outDir, filename));
}

await writeIcon(192, 'pwa-192.png');
await writeIcon(512, 'pwa-512.png');
await sharp(src).png().toFile(path.join(outDir, 'lab_logo.png'));

console.log('PWA icons written to public/');
