const sharp = require('sharp');
const path = require('path');

const legacySizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192
};

const foregroundSizes = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432
};

const resDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const squareSvg = path.join(__dirname, 'icon-source.svg');
const roundSvg = path.join(__dirname, 'icon-source-round.svg');
const foregroundSvg = path.join(__dirname, 'icon-foreground.svg');

(async () => {
  for (const [density, size] of Object.entries(legacySizes)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await sharp(squareSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(roundSvg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  }
  for (const [density, size] of Object.entries(foregroundSizes)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    await sharp(foregroundSvg, { density: 300 })
      .resize(size, size)
      .png()
      .toFile(path.join(dir, 'ic_launcher_foreground.png'));
  }
  console.log('done');
})();
