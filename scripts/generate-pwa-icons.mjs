/**
 * Iconos PWA, toast web y notificación Android desde src/assets/lab_logo.png.
 *
 * Web: fondo navy opaco (Windows rellena la transparencia con blanco).
 * Android status bar: silueta blanca sobre transparente (el sistema tiñe el icono).
 *
 * Run: node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'assets', 'lab_logo.png');
const outDir = path.join(root, 'public');
const androidRes = path.join(root, 'android', 'app', 'src', 'main', 'res');

const NAVY = { r: 11, g: 24, b: 42 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function cleanedLogoBuffer() {
  const trimmed = await sharp(src).ensureAlpha().trim({ threshold: 12 }).png().toBuffer();
  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lightHalo = r > 170 && g > 170 && b > 170;
    const logoBlue = b > r + 20 && b > 70 && r < 140;
    if (lightHalo && !logoBlue) data[i + 3] = 0;
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function paddedLogo(size, padRatio, { white = false } = {}) {
  const logo = await cleanedLogoBuffer();
  let { data, info } = await sharp(logo)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (white) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 16) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      }
    }
  }

  const inner = Math.max(1, Math.round(size * (1 - padRatio * 2)));
  const resized = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function logoOnNavy(size, padRatio = 0.14) {
  const logo = await paddedLogo(size, padRatio);
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: NAVY,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png();
}

async function writePublicIcon(size, filename, padRatio) {
  await (await logoOnNavy(size, padRatio)).toFile(path.join(outDir, filename));
}

async function writeAndroidPng(relDir, filename, buffer) {
  const dir = path.join(androidRes, relDir);
  fs.mkdirSync(dir, { recursive: true });
  await sharp(buffer).png().toFile(path.join(dir, filename));
}

await writePublicIcon(192, 'pwa-192.png', 0.14);
await writePublicIcon(512, 'pwa-512.png', 0.14);
await writePublicIcon(192, 'notification-icon.png', 0.16);
await sharp(src).png().toFile(path.join(outDir, 'lab_logo.png'));

if (fs.existsSync(androidRes)) {
  const statSizes = [
    ['drawable-mdpi', 24],
    ['drawable-hdpi', 36],
    ['drawable-xhdpi', 48],
    ['drawable-xxhdpi', 72],
    ['drawable-xxxhdpi', 96],
  ];
  for (const [folder, size] of statSizes) {
    const buf = await paddedLogo(size, 0.18, { white: true });
    await writeAndroidPng(folder, 'ic_stat_ag.png', buf);
  }

  const launcherSizes = [
    ['mipmap-mdpi', 48],
    ['mipmap-hdpi', 72],
    ['mipmap-xhdpi', 96],
    ['mipmap-xxhdpi', 144],
    ['mipmap-xxxhdpi', 192],
  ];
  for (const [folder, size] of launcherSizes) {
    const buf = await (await logoOnNavy(size, 0.16)).png().toBuffer();
    await writeAndroidPng(folder, 'ic_launcher.png', buf);
    await writeAndroidPng(folder, 'ic_launcher_round.png', buf);
  }

  const foregroundSizes = [
    ['mipmap-mdpi', 108],
    ['mipmap-hdpi', 162],
    ['mipmap-xhdpi', 216],
    ['mipmap-xxhdpi', 324],
    ['mipmap-xxxhdpi', 432],
  ];
  for (const [folder, size] of foregroundSizes) {
    const buf = await paddedLogo(size, 0.22);
    await writeAndroidPng(folder, 'ic_launcher_foreground.png', buf);
  }

  console.log('Android notification + launcher icons written');
}

console.log('PWA + notification icons written to public/');
