import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let canvasInstance;

/**
 * Initializes canvas and bundled fonts.
 */
async function initCanvas() {
  if (canvasInstance) return canvasInstance;
  try {
    const canvas = await import('@napi-rs/canvas');
    const bundledFont = path.join(__dirname, '../assets/JetBrainsMono.ttf');
    try {
      await fs.access(bundledFont);
      canvas.GlobalFonts.registerFromPath(bundledFont, 'JetBrains Mono');
      canvas.GlobalFonts.registerFromPath(bundledFont, 'monospace');
    } catch (e) {}
    canvasInstance = canvas;
    return canvas;
  } catch (e) {
    return null;
  }
}

/**
 * Renders an SVG string to a PNG buffer and manages wallpaper storage.
 */
export async function renderPNG(svg, paths, options = {}) {
  const canvasMod = await initCanvas();
  if (!canvasMod) return null;

  const { resolution = '1920x1080', isDebug = false } = options;
  const [w, h] = resolution.split('x').map(Number);
  
  try {
    const canvas = canvasMod.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const img = await canvasMod.loadImage(Buffer.from(svg));
    ctx.drawImage(img, 0, 0, w, h);
    const buffer = canvas.toBuffer('image/png');

    if (isDebug) return buffer;

    // Save primary PNG
    await fs.writeFile(paths.png, buffer);
    
    // Manage wallpaper rotation
    const timestamp = Math.floor(Date.now() / 1000);
    const wallDir = paths.wallpaper;
    const latestPngName = `chart_${timestamp}.png`;
    
    await fs.mkdir(wallDir, { recursive: true });
    const oldFiles = await fs.readdir(wallDir);
    for (const file of oldFiles) {
      if (file.startsWith('chart_') && file.endsWith('.png')) {
        await fs.unlink(path.join(wallDir, file));
      }
    }
    await fs.writeFile(path.join(wallDir, latestPngName), buffer);
    return latestPngName;
  } catch (e) {
    console.error('telemetry-collector: PNG rendering failed', e);
    return null;
  }
}
