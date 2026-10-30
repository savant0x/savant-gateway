/**
 * Rasterises the committed image sources in `public/images/`.
 *
 * Everything the site and the README reference lives in `public/images/`.
 * Sources that can be re-rendered are committed as SVG (currently `og.svg`);
 * the PNG they produce is committed too, because social previews must be raster.
 *
 * Drop new artwork in as a replacement of the same filename and re-run
 * `npm run images` when an SVG source changed. `sharp` ships with Next's image
 * pipeline, so this adds no dependency of its own.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const images = path.join(root, "public", "images");

/** SVG source -> PNG output, in the dimensions the platform expects. */
const renders = [
  { source: "og.svg", output: "og.png", width: 1200, height: 630 },
];

let sharp;

try {
  sharp = require("sharp");
} catch {
  console.error(
    "render-images: `sharp` is not installed. It ships with Next's image pipeline, so run `npm install` first.",
  );
  process.exit(1);
}

for (const render of renders) {
  const source = path.join(images, render.source);
  const output = path.join(images, render.output);

  if (!(await fs.stat(source).catch(() => null))) {
    console.error(`render-images: missing source ${path.relative(root, source)}`);
    process.exit(1);
  }

  await sharp(source, { density: 144 })
    .resize(render.width, render.height, { fit: "cover" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(output);

  const { size } = await fs.stat(output);
  console.log(
    `render-images: ${path.relative(root, source)} -> ${path.relative(root, output)} ` +
      `(${render.width}x${render.height}, ${Math.round(size / 1024)} KB)`,
  );
}
