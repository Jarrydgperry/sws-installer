// Convert a PNG (provided by user) into a Windows .ico file for electron-builder
// Usage: node scripts/make-ico.js <inputPng> <outputIco>
const fs = require('fs');
const path = require('path');

async function run() {
  const src = process.argv[2];
  const dst = process.argv[3];
  if (!src || !dst) {
    console.error('Usage: node scripts/make-ico.js <inputPng> <outputIco>');
    process.exit(1);
  }
  if (!fs.existsSync(src)) {
    console.error('Input PNG not found:', src);
    process.exit(2);
  }

  // Use png-to-ico; it accepts file paths or buffers (arrays). Provide the path array for best results.
  try {
    let toIco = require('png-to-ico');
    if (toIco && typeof toIco !== 'function' && typeof toIco.default === 'function') {
      toIco = toIco.default;
    }
    const ico = await toIco(src);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, ico);
    console.log('ICO written:', dst);
    return;
  } catch (e) {
    console.warn('png-to-ico failed:', e && (e.message || e));
  }
  // Fallback: copy PNG so build still proceeds (not ideal for Windows installer icon)
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.warn('Icon fallback: copied PNG to', dst);
}

run().catch(e => { console.error(e); process.exit(1); });
