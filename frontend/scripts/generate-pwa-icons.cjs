const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const source = path.join(publicDir, "logo.svg");
const iconsDir = path.join(publicDir, "icons");
const background = { r: 240, g: 244, b: 248, alpha: 1 };

async function generateIcons() {
  if (!fs.existsSync(source)) {
    throw new Error(`Logo not found: ${source}`);
  }

  fs.mkdirSync(iconsDir, { recursive: true });

  await sharp(source)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "pwa-192x192.png"));

  await sharp(source)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "pwa-512x512.png"));

  await sharp(source)
    .resize(180, 180, { fit: "contain", background })
    .png()
    .toFile(path.join(iconsDir, "apple-touch-icon.png"));

  const centeredLogo = await sharp(source)
    .resize(410, 410, { fit: "contain", background })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background,
    },
  })
    .composite([{ input: centeredLogo, gravity: "center" }])
    .png()
    .toFile(path.join(iconsDir, "maskable-512x512.png"));
}

generateIcons().catch((error) => {
  console.error(error);
  process.exit(1);
});
