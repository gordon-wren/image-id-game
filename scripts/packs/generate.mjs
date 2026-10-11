#!/usr/bin/env node
// Builds question packs from the aircraft dataset (public/data/aircraft.json)
// using the recipes in recipes.json, so a new quiz is a few lines of JSON.
//
// Each recipe picks aircraft by group, country and first-flight year. Every
// question gets three curated wrong answers chosen from the whole dataset for
// being similar (same group, country, era, manufacturer), so a Su-27 is paired
// with a MiG-29 rather than a Cessna. Choices are seeded by question id, so
// re-running gives the same packs.
//
// Usage: node scripts/packs/generate.mjs        (or: npm run packs)
//
// Writes public/packs/<id>.json for every recipe, adds new ones to
// public/packs/index.json, and removes packs it generated earlier whose recipe
// is gone. Hand-written packs are never touched.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const RECIPES = join(here, "recipes.json");
const DATASET = join(root, "public/data/aircraft.json");
const PACKS_DIR = join(root, "public/packs");
const GENERATED_FROM = "scripts/packs/recipes.json";
const ASSET_BASE = "assets/aircraft/";
const DISTRACTORS = 3;
/** Distractors are drawn at random from this many of the most similar aircraft. */
const SHORTLIST = 8;
const MIN_QUESTIONS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** FNV-1a, for seeding the RNG from a question id. */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** mulberry32: small seeded RNG, returns floats in [0, 1). */
export function rngFor(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const year = (a) => (a.firstFlight ? Number(String(a.firstFlight).slice(0, 4)) : null);
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * True when one label is the other plus a suffix ("Boeing 747" / "Boeing 747-8",
 * "Airbus A330" / "Airbus A330neo"). A photo of one is arguably also the other,
 * so they never appear as each other's wrong answer.
 */
function overlaps(a, b) {
  const x = norm(a.label), y = norm(b.label);
  return x.startsWith(y) || y.startsWith(x);
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/**
 * Aircraft matching a recipe's `where`. Every given condition must hold:
 *   group:       one group or a list
 *   country:     any countryOfOrigin containing one of these (case-insensitive)
 *   firstFlight: [fromYear, toYear], inclusive; either end may be null
 *   ids:         only these aircraft
 *   exclude:     never these aircraft
 */
export function selectAircraft(aircraft, where = {}) {
  const groups = asList(where.group);
  const countries = asList(where.country).map((c) => c.toLowerCase());
  const ids = asList(where.ids);
  const exclude = new Set(asList(where.exclude));
  const [from, to] = where.firstFlight ?? [null, null];
  return aircraft.filter((a) => {
    if (exclude.has(a.id)) return false;
    if (ids.length && !ids.includes(a.id)) return false;
    if (groups.length && !groups.includes(a.group)) return false;
    if (countries.length && !a.countryOfOrigin.some((c) => countries.some((w) => c.toLowerCase().includes(w)))) return false;
    if (from != null || to != null) {
      const y = year(a);
      if (y == null || (from != null && y < from) || (to != null && y > to)) return false;
    }
    return true;
  });
}

/** Folds historical names together so a Soviet design counts as related to its Russian successor. */
function countryKey(c) {
  const k = c.toLowerCase();
  if (/soviet|russia/.test(k)) return "russia";
  if (/german/.test(k)) return "germany";
  if (/japan/.test(k)) return "japan";
  if (/china/.test(k)) return "china";
  return k;
}

/** How alike two aircraft are, for picking convincing wrong answers. */
export function similarity(a, b) {
  let s = 0;
  if (a.group === b.group) s += 4;
  const countries = new Set(b.countryOfOrigin.map(countryKey));
  if (a.countryOfOrigin.some((c) => countries.has(countryKey(c)))) s += 2;
  const ya = year(a), yb = year(b);
  if (ya != null && yb != null) {
    const gap = Math.abs(ya - yb);
    if (gap <= 10) s += 2;
    else if (gap <= 25) s += 1;
  }
  if (a.manufacturer.some((m) => b.manufacturer.includes(m))) s += 2;
  return s;
}

/**
 * Three wrong answers for `answer`: always the most similar aircraft in `pool`,
 * then a random draw from the next most similar, so questions vary between packs.
 */
export function pickDistractors(answer, pool, seed, count = DISTRACTORS) {
  const rng = rngFor(seed);
  // Each pair gets its own tie-break, so adding an aircraft to the dataset only
  // changes the questions it actually ranks for, not every pack.
  const ranked = pool
    .filter((c) => c.id !== answer.id && !overlaps(c, answer))
    .map((c) => ({ c, score: similarity(answer, c), tie: rngFor(`${seed}|${c.id}`)() }))
    .sort((x, y) => y.score - x.score || x.tie - y.tie);
  // Weak matches only make the shortlist when there aren't enough strong ones.
  const floor = (ranked[0]?.score ?? 0) / 2;
  const strong = ranked.filter((r, i) => i < count || r.score >= floor);
  const shortlist = strong.slice(0, Math.max(SHORTLIST, count)).map((r) => r.c);
  const picked = shortlist.splice(0, Math.min(1, count));
  while (picked.length < count && shortlist.length) {
    picked.push(shortlist.splice(Math.floor(rng() * shortlist.length), 1)[0]);
  }
  return picked;
}

function caption(a) {
  const y = year(a);
  const desc = a.description ? a.description[0].toUpperCase() + a.description.slice(1) : null;
  return [desc, y ? `First flew ${y}` : null].filter(Boolean).join(". ") + ".";
}

// ---------------------------------------------------------------------------
// Packs
// ---------------------------------------------------------------------------

export function buildPack(recipe, aircraft) {
  const withPhoto = aircraft.filter((a) => a.photo?.file);
  const members = selectAircraft(withPhoto, recipe.where);
  if (members.length < MIN_QUESTIONS) {
    throw new Error(`Recipe "${recipe.id}" matches ${members.length} aircraft with photos; needs at least ${MIN_QUESTIONS}.`);
  }
  const questions = members.map((a) => {
    const id = `${recipe.id}-${a.id}`;
    const wrong = pickDistractors(a, aircraft, id);
    return {
      id,
      image: a.photo.file.slice(ASSET_BASE.length),
      answer: a.id,
      options: [a, ...wrong].map((o) => ({ id: o.id, label: o.label })),
      caption: caption(a),
      credit: a.photo.credit,
    };
  });
  return {
    id: recipe.id,
    title: recipe.title,
    ...(recipe.description ? { description: recipe.description } : {}),
    path: recipe.path,
    ...(recipe.categoryDescription ? { categoryDescription: recipe.categoryDescription } : {}),
    theme: { accent: recipe.accent },
    assetBase: ASSET_BASE,
    roundSeconds: recipe.roundSeconds ?? 7,
    shuffleOptions: true,
    shuffleQuestions: true,
    generatedFrom: GENERATED_FROM,
    questions,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const recipes = await readJson(RECIPES);
  const { aircraft } = await readJson(DATASET);
  const indexPath = join(PACKS_DIR, "index.json");
  const index = await readJson(indexPath);

  const wanted = new Set(recipes.map((r) => `${r.id}.json`));
  const kept = [];
  for (const file of index) {
    const pack = await readJson(join(PACKS_DIR, file)).catch(() => null);
    if (pack?.generatedFrom === GENERATED_FROM && !wanted.has(file)) {
      await unlink(join(PACKS_DIR, file));
      console.log(`removed ${file} (recipe gone)`);
      continue;
    }
    if (pack && !pack.generatedFrom && wanted.has(file)) {
      throw new Error(`${file} is hand-written; rename the recipe "${file.replace(/\.json$/, "")}" instead of overwriting it.`);
    }
    kept.push(file);
  }

  for (const recipe of recipes) {
    const pack = buildPack(recipe, aircraft);
    await writeFile(join(PACKS_DIR, `${recipe.id}.json`), JSON.stringify(pack, null, 2) + "\n");
    if (!kept.includes(`${recipe.id}.json`)) kept.push(`${recipe.id}.json`);
    console.log(`wrote ${recipe.id}.json (${pack.questions.length} questions)`);
  }
  await writeFile(indexPath, JSON.stringify(kept) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
