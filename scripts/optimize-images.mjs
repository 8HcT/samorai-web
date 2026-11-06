/**
 * Optimización de imágenes (se ejecuta antes de `dev` y `build`).
 *
 * 1. Variantes WebP de cada .jpg/.png de public/images en 400/800/1200/1920 px
 *    → public/images/_opt/<ruta>-<ancho>.webp (no se commitean; se regeneran
 *    solo si el original es más nuevo). Las usa `app/lib/images.ts`.
 * 2. Recursos de marca (sí se commitean; se crean si faltan, o con --force):
 *    imagen para compartir 1200×630, logo PNG para Google e iconos.
 *
 * Uso: npm run images  (o  node scripts/optimize-images.mjs --force)
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PUBLIC = path.resolve('public');
const IMAGES = path.join(PUBLIC, 'images');
const OUT = path.join(IMAGES, '_opt');
const WIDTHS = [400, 800, 1200, 1920]; // mantener igual que app/lib/images.ts
const SKIP_DIRS = new Set(['_opt', 'og']);
const force = process.argv.includes('--force');

async function mtime(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return 0;
  }
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full);
    } else if (/\.(jpe?g|png)$/i.test(entry.name)) {
      yield full;
    }
  }
}

async function variants() {
  let made = 0;
  let total = 0;
  for await (const src of walk(IMAGES)) {
    const rel = path.relative(IMAGES, src).replace(/\.(jpe?g|png)$/i, '');
    const srcTime = await mtime(src);
    for (const w of WIDTHS) {
      total++;
      const out = path.join(OUT, `${rel}-${w}.webp`);
      if (!force && (await mtime(out)) >= srcTime) continue;
      await mkdir(path.dirname(out), { recursive: true });
      await sharp(src)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 78, effort: 5 })
        .toFile(out);
      made++;
    }
  }
  console.log(`[images] variantes WebP: ${made} generadas, ${total - made} al día`);
}

/** ICO con una sola imagen PNG embebida (formato válido desde Windows Vista). */
function pngToIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // tipo: icono
  header.writeUInt16LE(1, 4); // nº de imágenes
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt16LE(1, 10); // planos
  header.writeUInt16LE(32, 12); // bits por píxel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // offset de los datos
  return Buffer.concat([header, png]);
}

/** Emblema de marca centrado sobre blanco (los iconos oscuros no se ven en pestañas oscuras). */
async function emblem(size, padding) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(path.join(PUBLIC, 'favicon.svg'), { density: 600 })
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function brandAssets() {
  const targets = {
    og: path.join(IMAGES, 'og', 'samorai-og.jpg'),
    logo: path.join(IMAGES, 'og', 'samorai-logo.png'),
    touch: path.join(PUBLIC, 'apple-touch-icon.png'),
    fav48: path.join(PUBLIC, 'favicon-48.png'),
    ico: path.join(PUBLIC, 'favicon.ico'),
  };
  const missing = [];
  for (const [key, file] of Object.entries(targets)) {
    if (!force && (await mtime(file))) continue;
    missing.push([key, file]);
  }
  if (missing.length === 0) return;
  await mkdir(path.join(IMAGES, 'og'), { recursive: true });
  const todo = new Set(missing.map(([k]) => k));

  if (todo.has('og')) {
    await sharp(path.join(IMAGES, 'home-hero.png'))
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(targets.og);
  }
  if (todo.has('logo')) await writeFile(targets.logo, await emblem(512, 0.12));
  if (todo.has('touch')) await writeFile(targets.touch, await emblem(180, 0.14));
  if (todo.has('fav48') || todo.has('ico')) {
    const png48 = await emblem(48, 0.06);
    await writeFile(targets.fav48, png48);
    await writeFile(targets.ico, pngToIco(png48, 48));
  }
  console.log(`[images] recursos de marca: ${[...todo].join(', ')}`);
}

await variants();
await brandAssets();
