// Checks the real packs in public/packs: each one validates, every image it
// points at exists, and the generated ones match what the generator would build.
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validatePack } from "../../src/engine/pack.ts";
import { buildCatalog, buildPack } from "./generate.mjs";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const index = readJson("public/packs/index.json");
const packs = index.map((file) => [file, readJson(`public/packs/${file}`)]);
const { aircraft } = readJson("public/data/aircraft.json");
const photos = new Map(aircraft.filter((a) => a.photo?.file).map((a) => [a.photo.file, a.photo]));
const labels = new Map(aircraft.map((a) => [a.id, a.label]));
const recipes = readJson("scripts/packs/recipes.json");

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
  it.each(recipes.map((r) => [r.id, r]))("%s is listed and up to date (run `npm run packs`)", (id, recipe) => {
    expect(index).toContain(`${id}.json`);
    expect(readJson(`public/packs/${id}.json`)).toEqual(buildPack(recipe, aircraft));
  });
});

describe("collection catalog", () => {
  it("is up to date (run `npm run packs`)", () => {
    const catalog = readJson("public/data/collection.json");
    expect(catalog).toEqual(buildCatalog(packs, aircraft, catalog));
  });
});
