// Renders assets/icon-src/*.svg to PNGs and a multi-size Windows .ico.
// Run with: npm run icon
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'icon-src');
const OUT = path.join(__dirname, '..', 'assets');
// 16-24 px use the simplified drawing, the rest the detailed one
const SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const svgFor = (size) => fs.readFileSync(path.join(SRC, size <= 24 ? 'icon-small.svg' : 'icon.svg'), 'utf8');

async function render(win, svg, size) {
  const url = await win.webContents.executeJavaScript(`new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = ${size};
      c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
      done(c.toDataURL('image/png'));
    };
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
  })`);
  return Buffer.from(url.split(',')[1], 'base64');
}

// ICO with PNG-compressed entries (supported since Windows Vista)
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dir = images.map(({ size, png }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
    offset += png.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...images.map((i) => i.png)]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<html></html>');
  const images = [];
  for (const size of SIZES) images.push({ size, png: await render(win, svgFor(size), size) });
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(images));
  fs.writeFileSync(path.join(OUT, 'icon.png'), images.find((i) => i.size === 256).png);
  fs.writeFileSync(path.join(OUT, 'icon-32.png'), images.find((i) => i.size === 32).png);
  // macOS menu bar: 18 pt template image, @2x for Retina
  const tray = fs.readFileSync(path.join(SRC, 'tray-template.svg'), 'utf8');
  fs.writeFileSync(path.join(OUT, 'trayTemplate.png'), await render(win, tray, 18));
  fs.writeFileSync(path.join(OUT, 'trayTemplate@2x.png'), await render(win, tray, 36));
  // the macOS app icon (.icns) is generated from this by electron-builder
  fs.writeFileSync(path.join(OUT, 'icon-1024.png'), await render(win, svgFor(1024), 1024));
  console.log(`wrote icon.ico (${SIZES.join(', ')} px), icon.png, icon-32.png, icon-1024.png, trayTemplate.png (+@2x)`);
  app.quit();
});
