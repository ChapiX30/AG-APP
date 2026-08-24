/**
 * Iconos PWA y de notificación desde src/assets/lab_logo.png.
 *
 * El logo no es cuadrado y el fondo es transparente. Si se rellena con blanco
 * (fit:contain), Windows dibuja esas rayas blancas en el toast.
 * Aquí: recorte, fondo navy opaco (sin alpha) y padding.
 *
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const src = path.join(root, 'src', 'assets', 'lab_logo.png');
const outDir = path.join(root, 'public');

/** Navy del toast / PWA — opaco para que Windows no rellene con blanco. */
const NAVY = { r: 11, g: 24, b: 42 };

async function logoOnNavy(size, padRatio = 0.14) {
  const inner = Math.max(1, Math.round(size * (1 - padRatio * 2)));

  const trimmed = await sharp(src)
    .ensureAlpha()
    .trim({ threshold: 12 })
    .png()
    .toBuffer();

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

  const cleaned = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(inner, inner, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: NAVY,
    },
  })
    .composite([{ input: cleaned, gravity: 'centre' }])
    .png();
}

async function writeIcon(size, filename, padRatio) {
  await (await logoOnNavy(size, padRatio)).toFile(path.join(outDir, filename));
}

await writeIcon(192, 'pwa-192.png', 0.14);
await writeIcon(512, 'pwa-512.png', 0.14);
await writeIcon(192, 'notification-icon.png', 0.16);
await sharp(src).png().toFile(path.join(outDir, 'lab_logo.png'));

console.log('PWA + notification icons written to public/');
