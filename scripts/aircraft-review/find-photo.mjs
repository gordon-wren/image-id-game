#!/usr/bin/env node
// Searches Wikimedia Commons for public-domain photos to replace a weak one:
// landscape, at least 1200px wide, and not obviously a cockpit, crew shot,
// museum piece, factory floor and so on. Saves 480px previews to <out dir> and
// prints each file name to pin in review.json. See docs/aircraft-review.md.
//
// Usage: node scripts/aircraft-review/find-photo.mjs <out dir> <id> "<search>" [count]
//   e.g. node scripts/aircraft-review/find-photo.mjs /tmp/review-us/alt p47 '"P-47" Thunderbolt in flight'

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [outDir, id, search, count = "4"] = process.argv.slice(2);
if (!outDir || !id || !search) {
  console.error('Usage: node scripts/aircraft-review/find-photo.mjs <out dir> <id> "<search>" [count]');
  process.exit(1);
}

const UA = "image-id-game-dataset-builder/1.0 (https://github.com/gordon-wren/image-id-game)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NOT_WANTED = /cockpit|interior|engine|crew|museum|wreck|crash|model|drawing|poster|nose|tail|detail|production|factory|assembly/i;

async function api(params) {
  for (let i = 0; i < 5; i++) {
    const r = await fetch("https://commons.wikimedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params }), { headers: { "User-Agent": UA } });
    if (r.ok) return r.json();
    await sleep(3000 * (i + 1));
  }
  throw new Error("Commons search failed");
}

const r = await api({
  action: "query", generator: "search", gsrsearch: `${search} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "50",
  prop: "imageinfo", iiprop: "url|size|extmetadata", iiextmetadatafilter: "LicenseShortName", iiurlwidth: "480",
});
const files = (r.query?.pages ?? [])
  .sort((a, b) => a.index - b.index)
  .map((p) => ({ title: p.title, info: p.imageinfo?.[0] }))
  .filter(({ title, info }) => info && /\.jpe?g$/i.test(title) && !NOT_WANTED.test(title)
    && /^(public domain|pd|cc0)/i.test(info.extmetadata?.LicenseShortName?.value ?? "")
    && info.width >= 1200 && info.width / info.height > 1.2 && info.width / info.height < 2.1)
  .slice(0, Number(count));

await mkdir(outDir, { recursive: true });
for (const [i, { title, info }] of files.entries()) {
  const path = join(outDir, `${id}-${i + 1}.jpg`);
  await writeFile(path, Buffer.from(await (await fetch(info.thumburl, { headers: { "User-Agent": UA } })).arrayBuffer()));
  console.log(`${path}  ${info.extmetadata.LicenseShortName.value}  ${title}`);
  await sleep(300);
}
if (!files.length) console.log(`No public-domain matches for ${id}; try a different search.`);
