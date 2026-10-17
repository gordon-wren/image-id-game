#!/usr/bin/env node
// Adds approved aircraft from a review folder to the dataset seed
// (scripts/aircraft-dataset/seed.json). Pins each reviewed photo, records the
// country (Wikidata often lacks it for older types) and any service year filled
// in by hand. Then rebuild those entries with the dataset builder.
// See docs/aircraft-review.md.
//
// Usage: node scripts/aircraft-review/apply.mjs <review dir> "<country>" [id,id,...]
//   With no id list, every non-dropped entry in review.json is added.

import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [dir, country, only] = process.argv.slice(2);
if (!dir || !country) {
  console.error('Usage: node scripts/aircraft-review/apply.mjs <review dir> "<country>" [id,id,...]');
  process.exit(1);
}

const SEED = resolve(fileURLToPath(import.meta.url), "../../aircraft-dataset/seed.json");
const seed = JSON.parse(await readFile(SEED, "utf8"));
const review = JSON.parse(await readFile(join(dir, "review.json"), "utf8"));
const wanted = only ? new Set(only.split(",")) : null;
const approved = review.filter((a) => !a.dropped && !a.error && (!wanted || wanted.has(a.id)));

// `group` drives the existing pack recipes. Piston fighters, attack aircraft and
// bombers up to 1945 are "historic" (the WWII Warbirds pack); jets and later
// types go by role.
function groupFor(a) {
  if (/helicopter/.test(a.category)) return "helicopter";
  if (a.category === "trainer") return "trainer";
  const combat = ["fighter", "attack", "bomber"].includes(a.category);
  if (combat && a.engine === "piston" && (a.introduced ?? a.firstFlight) <= 1945) return "historic";
  if (a.category === "fighter" || a.category === "attack") return "fighter-attack";
  if (a.category === "bomber") return "bomber";
  return "military-transport-special";
}

const ids = new Set(seed.map((s) => s.id));
const titles = new Set(seed.map((s) => s.wikipediaTitle));
const clashes = approved.filter((a) => ids.has(a.id)).map((a) => a.id);
if (clashes.length) throw new Error(`These ids are already in the seed; rename them in review.json first: ${clashes.join(", ")}`);
const dupes = approved.filter((a) => titles.has(a.name)).map((a) => a.name);
if (dupes.length) throw new Error(`These articles are already in the seed: ${dupes.join(", ")}`);

for (const a of approved) {
  const overrides = {
    countryOfOrigin: [country],
    ...(a.introducedByHand ? { introduced: String(a.introduced) } : {}),
  };
  seed.push({
    id: a.id,
    wikipediaTitle: a.name,
    ...(a.label ? { label: a.label } : {}),
    group: groupFor(a),
    use: "military",
    category: a.category,
    engine: a.engine,
    photo: a.photo.file,
    overrides,
  });
}
await writeFile(SEED, JSON.stringify(seed, null, 2) + "\n");
console.log(`Added ${approved.length} aircraft to seed.json. Next:\n  node scripts/aircraft-dataset/build.mjs --only ${approved.map((a) => a.id).join(",")}`);
