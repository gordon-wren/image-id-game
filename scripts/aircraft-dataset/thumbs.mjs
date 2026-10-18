#!/usr/bin/env node
// Makes a small square thumbnail of every dataset photo, for the Explore
// panel's mosaic: public/assets/aircraft-thumbs/<id>.jpg, 240 × 240, cropped
// around the most detailed part of the photo (usually the aircraft).
//
// Usage: node scripts/aircraft-dataset/thumbs.mjs      (or: npm run thumbs)
//
// Only photos newer than their thumbnail are redone, and thumbnails of
// aircraft no longer in the dataset are removed. Run it after build.mjs.
// The thumbnails live outside public/assets/aircraft/ because build.mjs prunes
// anything in that folder it didn't write.

import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { THUMB_BASE } from "../../src/engine/sets.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const THUMB_SIZE = 240;

/** Where an aircraft's thumbnail lives, relative to public/. */
const thumbPath = (id) => `${THUMB_BASE}${id}.jpg`;

async function mtime(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

async function main() {
  const { aircraft } = JSON.parse(await readFile(join(root, "public/data/aircraft.json"), "utf8"));
  const outDir = join(root, "public", THUMB_BASE);
  await mkdir(outDir, { recursive: true });

  let made = 0;
  for (const a of aircraft.filter((x) => x.photo?.file)) {
    const src = join(root, "public", a.photo.file);
    const out = join(root, "public", thumbPath(a.id));
    const [srcTime, outTime] = await Promise.all([mtime(src), mtime(out)]);
    if (srcTime == null) throw new Error(`Missing photo for ${a.id}: ${a.photo.file}`);
    if (outTime != null && outTime >= srcTime) continue;
    await sharp(src)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: sharp.strategy.attention })
      .jpeg({ quality: 72, mozjpeg: true })
      .toFile(out);
    made++;
  }

  const keep = new Set(aircraft.filter((x) => x.photo?.file).map((x) => `${x.id}.jpg`));
  let removed = 0;
  for (const f of await readdir(outDir)) {
    if (!keep.has(f)) {
      await unlink(join(outDir, f));
      removed++;
    }
  }
  console.log(`Thumbnails: ${made} made, ${removed} removed, ${keep.size} in all.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
