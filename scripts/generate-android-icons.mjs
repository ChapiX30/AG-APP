/**
 * Genera iconos launcher Android desde src/assets/lab_logo.png
 * Run: node scripts/generate-android-icons.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'assets', 'lab_logo.png');
const resDir = path.join(root, 'android', 'app', 'src', 'main', 'res');

const white = { r: 255, g: 255, b: 255, alpha: 1 };

const densities = [
  { folder: 'mipmap-mdpi', legacy: 48, adaptive: 108 },
  { folder: 'mipmap-hdpi', legacy: 72, adaptive: 162 },
  { folder: 'mipmap-xhdpi', legacy: 96, adaptive: 216 },
  { folder: 'mipmap-xxhdpi', legacy: 144, adaptive: 324 },
  { folder: 'mipmap-xxxhdpi', legacy: 192, adaptive: 432 },
];

async function writeLogoIcon(size, outPath, background = white) {
  const logoSize = Math.round(size * 0.72);
  const logo = await sharp(src)
    .resize(logoSize, logoSize, { fit: 'contain', background })
    .png()
    .toBuffer();

  const left = Math.round((size - logoSize) / 2);
  const top = Math.round((size - logoSize) / 2);

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(outPath);
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

for (const { folder, legacy, adaptive } of densities) {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  await writeLogoIcon(legacy, path.join(dir, 'ic_launcher.png'), white);
  await writeLogoIcon(legacy, path.join(dir, 'ic_launcher_round.png'), white);
  await writeLogoIcon(adaptive, path.join(dir, 'ic_launcher_foreground.png'), transparent);
}

console.log('Android launcher icons written to android/app/src/main/res/mipmap-*/');
