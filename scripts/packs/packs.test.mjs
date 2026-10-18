// Checks the real packs in public/packs: each one validates, every image it
// points at exists, the generated ones match what the generator would build
// from taxonomy.json, and every menu entry is populated.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePack } from "../../src/engine/pack.ts";
import { buildCatalog, buildExplore, buildPack, expandTaxonomy, foldSingleItemFolders, overlaps, stringifyExplore } from "./generate.mjs";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const index = readJson("public/packs/index.json");
const packs = index.map((file) => [file, readJson(`public/packs/${file}`)]);
const { aircraft } = readJson("public/data/aircraft.json");
const photos = new Map(aircraft.filter((a) => a.photo?.file).map((a) => [a.photo.file, a.photo]));
const labels = new Map(aircraft.map((a) => [a.id, a.label]));
const taxonomy = readJson("scripts/packs/taxonomy.json");
const handPaths = packs.filter(([, p]) => !p.generatedFrom).map(([, p]) => p.path ?? []);
const recipes = foldSingleItemFolders(expandTaxonomy(taxonomy, aircraft), handPaths);

describe.each(packs)("%s", (file, pack) => {
  it("validates", () => {
    expect(() => validatePack(pack)).not.toThrow();
  });

  it("points only at images that exist", () => {
    const missing = pack.questions
      .filter((q) => !/^(https?:|data:)/.test(q.image))
      .map((q) => `${pack.assetBase ?? ""}${q.image}`)
      .filter((path) => !existsSync(join(root, "public", path)));
    expect(missing).toEqual([]);
  });

  it("names dataset aircraft the way the dataset does", () => {
    // Typed mode compares answers by name, so "Airbus H145" here and
    // "Airbus H145 (EC145)" in another pack would mark a right answer wrong.
    const wrong = pack.questions
      .flatMap((q) => q.options ?? [])
      .filter((o) => labels.has(o.id) && o.label !== labels.get(o.id))
      .map((o) => `${o.id}: "${o.label}" should be "${labels.get(o.id)}"`);
    expect([...new Set(wrong)]).toEqual([]);
  });

  it("credits dataset photos the way the dataset does", () => {
    const wrong = pack.questions
      .map((q) => ({ q, photo: photos.get(`${pack.assetBase ?? ""}${q.image}`) }))
      .filter(({ q, photo }) => photo && q.credit !== photo.credit)
      .map(({ q }) => q.id);
    expect(wrong).toEqual([]);
  });
});

describe("generated packs", () => {
  it("are exactly the sets the taxonomy produces, in order (run `npm run packs`)", () => {
    const generated = index.filter((f) => readJson(`public/packs/${f}`).generatedFrom);
    expect(generated).toEqual(recipes.map((r) => `${r.id}.json`));
  });

  it.each(recipes.map((r) => [r.id, r]))("%s is up to date (run `npm run packs`)", (id, recipe) => {
    expect(readJson(`public/packs/${id}.json`)).toEqual(buildPack(recipe, aircraft, taxonomy.minAircraft));
  });

});

describe("wrong answers", () => {
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  it("come from the question's own set, unless the set has too few candidates", () => {
    const strays = [];
    for (const [, p] of packs.filter(([, p]) => p.generatedFrom)) {
      const members = p.questions.map((q) => byId.get(q.answer));
      for (const q of p.questions) {
        const answer = byId.get(q.answer);
        const candidates = members.filter((m) => m.id !== answer.id && !overlaps(m, answer)).length;
        const outside = q.options.filter((o) => o.id !== q.answer && !members.some((m) => m.id === o.id)).length;
        if (outside > Math.max(0, 3 - candidates)) strays.push(`${p.id}/${q.answer}`);
      }
    }
    expect(strays).toEqual([]);
  });
});

describe("menu", () => {
  it("has no folder below the top level holding fewer than two items", () => {
    const items = new Map();
    for (const [, p] of packs) {
      const path = p.path ?? [];
      for (let depth = 1; depth <= path.length; depth++) {
        const folder = path.slice(0, depth).join(" › ");
        if (!items.has(folder)) items.set(folder, new Set());
        items.get(folder).add(depth < path.length ? `folder:${path[depth]}` : `pack:${p.id}`);
      }
    }
    const thin = [...items].filter(([folder, set]) => folder.includes(" › ") && set.size < 2).map(([folder]) => folder);
    expect(thin).toEqual([]);
  });
});

describe("Explore data", () => {
  it("is up to date (run `npm run packs`)", () => {
    expect(readFileSync(join(root, "public/data/explore.json"), "utf8")).toBe(stringifyExplore(buildExplore(taxonomy, aircraft)));
  });
});

describe("collection catalog", () => {
  it("is up to date (run `npm run packs`)", () => {
    const catalog = readJson("public/data/collection.json");
    expect(catalog).toEqual(buildCatalog(packs, aircraft, catalog));
  });
});
