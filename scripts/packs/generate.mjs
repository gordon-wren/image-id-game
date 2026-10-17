#!/usr/bin/env node
// Builds the quiz menu from the aircraft dataset (public/data/aircraft.json)
// and the menu definition in taxonomy.json: no pack is listed by hand.
//
// Each menu in the taxonomy splits a slice of the dataset (e.g. military
// aircraft) into sets by era, decade or country of origin, or into an explicit
// list of sets (e.g. roles). A set becomes a pack only if at least
// `minAircraft` aircraft qualify, a folder holding a single item is folded
// into its parent, and each round draws at most `questionsPerRound` questions
// at random, so every menu entry is populated however the dataset grows.
//
// Every question gets three curated wrong answers chosen from the whole
// dataset for being similar (same group, country, era, manufacturer), so a
// Su-27 is paired with a MiG-29 rather than a Cessna. Choices are seeded by
// question id, so re-running gives the same packs.
//
// Usage: node scripts/packs/generate.mjs        (or: npm run packs)
//
// Writes public/packs/<id>.json for every set, updates public/packs/index.json,
// and removes packs it generated earlier that no longer qualify. Hand-written
// packs (no `generatedFrom`) are never touched. Also writes the aircraft
// collection catalog, public/data/collection.json, covering every pack.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const TAXONOMY = join(here, "taxonomy.json");
const DATASET = join(root, "public/data/aircraft.json");
const PACKS_DIR = join(root, "public/packs");
const CATALOG = join(root, "public/data/collection.json");
const GENERATED_FROM = "scripts/packs/taxonomy.json";
const ASSET_BASE = "assets/aircraft/";
const DISTRACTORS = 3;
/** Distractors are drawn at random from this many of the most similar aircraft. */
const SHORTLIST = 8;
const MIN_QUESTIONS = 5;
const DEFAULT_ROUND_SECONDS = 7;

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
 *   use, category, engine: one value or a list each (see aircraft.schema.json)
 *   country:     any countryOfOrigin containing one of these (case-insensitive)
 *   firstFlight: [fromYear, toYear], inclusive; either end may be null
 *   ids:         only these aircraft
 *   exclude:     never these aircraft
 */
export function selectAircraft(aircraft, where = {}) {
  const groups = asList(where.group);
  const attrs = ["use", "category", "engine"].map((k) => [k, asList(where[k])]).filter(([, v]) => v.length);
  const countries = asList(where.country).map((c) => c.toLowerCase());
  const ids = asList(where.ids);
  const exclude = new Set(asList(where.exclude));
  const [from, to] = where.firstFlight ?? [null, null];
  return aircraft.filter((a) => {
    if (exclude.has(a.id)) return false;
    if (ids.length && !ids.includes(a.id)) return false;
    if (groups.length && !groups.includes(a.group)) return false;
    if (attrs.some(([k, v]) => !v.includes(a[k]))) return false;
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

export function buildPack(recipe, aircraft, minimum = MIN_QUESTIONS) {
  const withPhoto = aircraft.filter((a) => a.photo?.file);
  const members = selectAircraft(withPhoto, recipe.where);
  if (members.length < minimum) {
    throw new Error(`Set "${recipe.id}" matches ${members.length} aircraft with photos; needs at least ${minimum}.`);
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
    roundSeconds: recipe.roundSeconds ?? DEFAULT_ROUND_SECONDS,
    shuffleOptions: true,
    shuffleQuestions: true,
    ...(recipe.questionsPerRound ? { questionsPerRound: recipe.questionsPerRound } : {}),
    generatedFrom: GENERATED_FROM,
    questions,
  };
}

// ---------------------------------------------------------------------------
// Taxonomy: the menu, derived from aircraft attributes
// ---------------------------------------------------------------------------

/** The year an aircraft entered service, which places it in an era or decade; null if not yet in service. */
export function serviceYear(a) {
  return a.introduced ? Number(String(a.introduced).slice(0, 4)) : null;
}

/**
 * The country an aircraft is filed under: the one country it comes from, with
 * old names folded into current ones (`aliases`), or "Multinational" when it was
 * built jointly by more than one.
 */
export function nationOf(a, aliases = {}) {
  const names = new Set(
    a.countryOfOrigin.flatMap((c) => c.split("/")).map((c) => c.trim()).filter(Boolean).map((c) => aliases[c] ?? c),
  );
  if (names.size !== 1) return names.size ? "Multinational" : null;
  return [...names][0];
}

/** "the United States", "the United Kingdom", but "France". */
const theNation = (n) => (/^(United|Soviet Union)/.test(n) ? `the ${n}` : n);

const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function eraRange(era) {
  if (era.from == null) return `up to ${era.to}`;
  if (era.to == null) return `from ${era.from}`;
  return `${era.from}–${era.to}`;
}

/** The candidate sets one split produces: [{ key, name, description, members }]. */
function split(by, members, taxonomy, scope) {
  const sets = [];
  if (by === "era") {
    for (const era of taxonomy.eras) {
      sets.push({
        key: era.id,
        name: era.name,
        description: `${scope} that entered service ${eraRange(era)}.`,
        members: members.filter((a) => {
          const y = serviceYear(a);
          return y != null && (era.from == null || y >= era.from) && (era.to == null || y <= era.to);
        }),
      });
    }
  } else if (by === "decade") {
    const decades = [...new Set(members.map(serviceYear).filter((y) => y != null).map((y) => Math.floor(y / 10) * 10))].sort();
    for (const d of decades) {
      sets.push({ key: `${d}s`, name: `${d}s`, description: `${scope} that entered service in the ${d}s.`, members: members.filter((a) => Math.floor((serviceYear(a) ?? -1) / 10) * 10 === d) });
    }
  } else if (by === "nation") {
    const byNation = new Map();
    for (const a of members) {
      const n = nationOf(a, taxonomy.nationAliases);
      if (!n) continue;
      if (!byNation.has(n)) byNation.set(n, []);
      byNation.get(n).push(a);
    }
    for (const [n, list] of [...byNation].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))) {
      sets.push({
        key: slug(n),
        name: n,
        description: n === "Multinational" ? `${scope} built jointly by more than one country.` : `${scope} from ${theNation(n)}.`,
        members: list,
      });
    }
  } else {
    throw new Error(`Unknown split "${by}"`);
  }
  return sets;
}

/**
 * Expands the taxonomy into pack recipes, keeping only sets with at least
 * `minAircraft` members. A menu with `then` nests a second split inside each
 * set of its first: a folder holding the whole set plus its sub-sets.
 */
export function expandTaxonomy(taxonomy, aircraft) {
  const min = taxonomy.minAircraft;
  const withPhoto = aircraft.filter((a) => a.photo?.file);
  const recipes = [];
  const recipe = (id, title, description, path, accent, members) => ({
    id, title, description, path, accent,
    questionsPerRound: taxonomy.questionsPerRound,
    where: { ids: members.map((a) => a.id) },
  });

  for (const menu of taxonomy.menus) {
    const scope = menu.where?.use === "civil" ? "Civil aircraft" : "Military aircraft";
    const base = selectAircraft(withPhoto, menu.where);
    const sets = menu.sets
      ? menu.sets.map((s) => ({ key: s.id, name: s.name, description: s.description, members: selectAircraft(base, s.where) }))
      : split(menu.by, base, taxonomy, scope);

    for (const set of sets.filter((s) => s.members.length >= min)) {
      const id = `${menu.id}-${set.key}`;
      const subScope = set.name === "Multinational" ? `Multinational ${scope.toLowerCase()}` : `${scope} from ${theNation(set.name)}`;
      // A sub-set holding every member of its parent would just repeat it.
      const subsets = menu.then
        ? split(menu.then, set.members, taxonomy, subScope).filter((s) => s.members.length >= min && s.members.length < set.members.length)
        : [];
      if (!subsets.length) {
        recipes.push(recipe(id, set.name, set.description, menu.path, menu.accent, set.members));
        continue;
      }
      const folder = [...menu.path, set.name];
      recipes.push(recipe(id, `${set.name}: all eras`, set.description, folder, menu.accent, set.members));
      for (const sub of subsets) {
        recipes.push(recipe(`${id}-${sub.key}`, `${set.name}: ${sub.name}`, sub.description, folder, menu.accent, sub.members));
      }
    }
  }
  return recipes;
}

/**
 * Folds away any folder that would hold only one item (one pack or one
 * sub-folder), so no menu entry opens onto a single choice: its item moves up
 * into the parent. Top-level folders stay. `fixedPaths` are hand-written
 * packs' paths: they count as items, and a folder holding one is left alone.
 */
export function foldSingleItemFolders(recipes, fixedPaths = []) {
  const key = (parts) => parts.join("\u0000");
  const startsWith = (path, parts) => parts.every((p, i) => path[i] === p);
  for (;;) {
    const paths = [...recipes.map((r) => ({ path: r.path, fixed: false })), ...fixedPaths.map((path) => ({ path, fixed: true }))];
    const folders = new Map(); // folder -> { subfolders, packs, fixed }
    for (const { path, fixed } of paths) {
      for (let depth = 1; depth <= path.length; depth++) {
        const k = key(path.slice(0, depth));
        if (!folders.has(k)) folders.set(k, { parts: path.slice(0, depth), subfolders: new Set(), packs: 0, fixed: false });
        const f = folders.get(k);
        if (depth < path.length) f.subfolders.add(path[depth]);
        else f.packs += 1;
        if (fixed) f.fixed = true;
      }
    }
    const single = [...folders.values()].find((f) => f.parts.length >= 2 && !f.fixed && f.subfolders.size + f.packs === 1);
    if (!single) return recipes;
    const parent = single.parts.slice(0, -1);
    for (const r of recipes) {
      if (startsWith(r.path, single.parts)) r.path = [...parent, ...r.path.slice(single.parts.length)];
    }
  }
}

// ---------------------------------------------------------------------------
// Collection catalog
// ---------------------------------------------------------------------------

const ABOUT_MAX = 320;

/** The first `count` sentences of a Wikipedia summary, not splitting after initials like "U.S.". */
export function firstSentences(text, count = 2) {
  if (!text) return null;
  const out = [];
  let start = 0;
  const re = /[.!?](?=\s+[A-Z0-9"(])/g;
  let m;
  while (out.length < count && (m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 3), m.index + 1);
    if (/(^|[\s.])[A-Z]\.$/.test(before)) continue; // "U.S." / "J. Smith"
    out.push(text.slice(start, m.index + 1).trim());
    start = m.index + 1;
  }
  if (out.length < count && start < text.length) out.push(text.slice(start).trim());
  const about = out.join(" ");
  return about.length > ABOUT_MAX ? about.slice(0, ABOUT_MAX - 1).replace(/\s+\S*$/, "") + "…" : about;
}

/** Up to two manufacturer names, leaving out Wikidata ids that never resolved to a label ("Q928183"). */
function manufacturers(list) {
  const names = list.filter((m) => !/^Q\d+$/.test(m)).slice(0, 2);
  return names.length ? names.join(", ") : null;
}

/** A question's answer label: its own option, then any option in the pack naming that id, then the id. */
function questionLabel(pack, q) {
  const own = q.options?.find((o) => o.id === q.answer)?.label;
  if (own) return own;
  for (const other of pack.questions) {
    const label = other.options?.find((o) => o.id === q.answer)?.label;
    if (label) return label;
  }
  return q.answer;
}

/**
 * The aircraft collection: one entry per aircraft across every pack. A dataset
 * aircraft is keyed by its id, so it is one entry however many packs include
 * it; anything else is keyed "<pack>/<answer>". Numbers are permanent: every
 * key ever numbered keeps its number in `numbers`, and new keys are appended.
 *
 * @param packs     [file, pack] pairs in menu order
 * @param previous  the last catalog, for its numbers (or null)
 */
export function buildCatalog(packs, aircraft, previous) {
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const numbers = { ...(previous?.numbers ?? {}) };
  let next = Math.max(0, ...Object.values(numbers)) + 1;
  const entries = {};
  const aliases = {};

  for (const [, pack] of packs) {
    for (const q of pack.questions) {
      const a = byId.get(q.answer);
      const key = a ? a.id : `${pack.id}/${q.answer}`;
      aliases[`${pack.id}/${q.answer}`] = key;
      if (entries[key]) {
        if (!entries[key].packs.includes(pack.id)) entries[key].packs.push(pack.id);
        continue;
      }
      numbers[key] ??= next++;
      entries[key] = a?.photo?.file
        ? {
            number: numbers[key],
            name: a.label,
            image: a.photo.file,
            credit: a.photo.credit,
            packs: [pack.id],
            facts: {
              description: a.description ? a.description[0].toUpperCase() + a.description.slice(1) : null,
              role: a.role ?? null,
              manufacturer: manufacturers(a.manufacturer),
              firstFlight: a.firstFlight ? Number(String(a.firstFlight).slice(0, 4)) : null,
              country: a.countryOfOrigin.length ? a.countryOfOrigin.join(" / ") : null,
              // An aircraft sharing a relative's article (Ka-52 → Ka-50) would get the relative's summary.
              about: a.wikipedia?.title === a.name ? firstSentences(a.summary) : null,
              wikipedia: a.wikipedia?.url ?? null,
            },
          }
        : {
            number: numbers[key],
            name: questionLabel(pack, q),
            image: /^(https?:|data:)/.test(q.image) ? q.image : `${pack.assetBase ?? ""}${q.image}`,
            credit: q.credit ?? null,
            packs: [pack.id],
            ...(q.caption ? { caption: q.caption } : {}),
          };
    }
  }

  return { generatedFrom: GENERATED_FROM, numbers, entries, aliases };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const taxonomy = await readJson(TAXONOMY);
  const { aircraft } = await readJson(DATASET);
  const indexPath = join(PACKS_DIR, "index.json");
  const index = await readJson(indexPath);

  // Hand-written packs stay as they are; generated ones are rebuilt from scratch.
  const hand = [];
  const previous = [];
  for (const file of index) {
    const pack = await readJson(join(PACKS_DIR, file)).catch(() => null);
    if (!pack) continue;
    if (pack.generatedFrom) previous.push(file);
    else hand.push([file, pack]);
  }

  const recipes = foldSingleItemFolders(expandTaxonomy(taxonomy, aircraft), hand.map(([, p]) => p.path ?? []));
  const generated = [];
  for (const recipe of recipes) {
    const file = `${recipe.id}.json`;
    if (hand.some(([f]) => f === file)) throw new Error(`${file} is hand-written; rename it or the taxonomy set.`);
    const pack = buildPack(recipe, aircraft, taxonomy.minAircraft);
    await writeFile(join(PACKS_DIR, file), JSON.stringify(pack, null, 2) + "\n");
    generated.push(file);
  }
  for (const file of previous.filter((f) => !generated.includes(f))) {
    await unlink(join(PACKS_DIR, file));
    console.log(`removed ${file} (no longer generated)`);
  }
  const files = [...generated, ...hand.map(([f]) => f)];
  await writeFile(indexPath, JSON.stringify(files) + "\n");
  console.log(`wrote ${generated.length} generated packs; ${hand.length} hand-written packs kept`);

  const packs = await Promise.all(files.map(async (file) => [file, await readJson(join(PACKS_DIR, file))]));
  const previousCatalog = await readJson(CATALOG).catch(() => null);
  const catalog = buildCatalog(packs, aircraft, previousCatalog);
  await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + "\n");
  console.log(`wrote collection.json (${Object.keys(catalog.entries).length} entries)`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
