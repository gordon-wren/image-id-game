import { describe, it, expect } from "vitest";
import { buildPack, pickDistractors, selectAircraft, similarity } from "./generate.mjs";

const plane = (id, label, group, country, firstFlight, manufacturer = [label.split(" ")[0]]) => ({
  id,
  label,
  group,
  countryOfOrigin: [country],
  firstFlight,
  manufacturer,
  description: `${label} description`,
  photo: { file: `assets/aircraft/${id}.jpg`, credit: `${id} credit` },
});

const fleet = [
  plane("f15", "McDonnell Douglas F-15 Eagle", "fighter-attack", "United States", "1972-07-27"),
  plane("f16", "General Dynamics F-16", "fighter-attack", "United States", "1974-01-20"),
  plane("su27", "Sukhoi Su-27", "fighter-attack", "Soviet Union", "1977-05-20"),
  plane("su35", "Sukhoi Su-35", "fighter-attack", "Russia", "2008-02-19"),
  plane("mig29", "Mikoyan MiG-29", "fighter-attack", "Soviet Union", "1977-10-06"),
  plane("b747", "Boeing 747", "airliner-widebody", "United States", "1969-02-09", ["Boeing"]),
  plane("b747-8", "Boeing 747-8", "airliner-widebody", "United States", "2010-02-08", ["Boeing"]),
  plane("b777", "Boeing 777", "airliner-widebody", "United States", "1994-06-12", ["Boeing"]),
  plane("a380", "Airbus A380", "airliner-widebody", "France", "2005-04-27", ["Airbus"]),
  plane("c172", "Cessna 172", "business-general", "United States", "1955-06-12"),
];

describe("selectAircraft", () => {
  it("filters by group", () => {
    expect(selectAircraft(fleet, { group: "fighter-attack" }).map((a) => a.id)).toEqual(["f15", "f16", "su27", "su35", "mig29"]);
  });

  it("matches countries case-insensitively by substring", () => {
    expect(selectAircraft(fleet, { country: ["soviet", "Russia"] }).map((a) => a.id)).toEqual(["su27", "su35", "mig29"]);
  });

  it("filters by an inclusive first-flight range, open at either end", () => {
    expect(selectAircraft(fleet, { group: "fighter-attack", firstFlight: [1974, 1977] }).map((a) => a.id)).toEqual(["f16", "su27", "mig29"]);
    expect(selectAircraft(fleet, { firstFlight: [null, 1960] }).map((a) => a.id)).toEqual(["c172"]);
  });

  it("combines conditions and honours ids and exclude", () => {
    expect(selectAircraft(fleet, { group: "fighter-attack", exclude: ["f16", "su35"] }).map((a) => a.id)).toEqual(["f15", "su27", "mig29"]);
    expect(selectAircraft(fleet, { ids: ["a380", "c172"] }).map((a) => a.id)).toEqual(["a380", "c172"]);
  });
});

describe("similarity", () => {
  it("treats Soviet and Russian designs as the same country", () => {
    const su27 = fleet.find((a) => a.id === "su27");
    const su35 = fleet.find((a) => a.id === "su35");
    const f15 = fleet.find((a) => a.id === "f15");
    expect(similarity(su35, su27)).toBeGreaterThan(similarity(su35, f15));
  });
});

describe("pickDistractors", () => {
  const su27 = fleet.find((a) => a.id === "su27");

  it("is deterministic for a seed and never includes the answer", () => {
    const a = pickDistractors(su27, fleet, "seed-1").map((x) => x.id);
    expect(pickDistractors(su27, fleet, "seed-1").map((x) => x.id)).toEqual(a);
    expect(a).toHaveLength(3);
    expect(a).not.toContain("su27");
    expect(new Set(a).size).toBe(3);
  });

  it("always includes the closest match", () => {
    // Same group, country and manufacturer as the Su-35; nothing else matches all three.
    const su35 = fleet.find((a) => a.id === "su35");
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(pickDistractors(su35, fleet, seed).map((x) => x.id)).toContain("su27");
    }
  });

  it("keeps weak matches out when there are enough strong ones", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(pickDistractors(su27, fleet, seed).map((x) => x.group)).toEqual(Array(3).fill("fighter-attack"));
    }
  });

  it("isn't reshuffled by adding an unrelated aircraft to the dataset", () => {
    const f15 = fleet.find((a) => a.id === "f15");
    const extra = plane("dc3", "Douglas DC-3", "regional", "United States", "1935-12-17");
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const before = pickDistractors(f15, fleet, seed).map((x) => x.id);
      expect(pickDistractors(f15, [extra, ...fleet], seed).map((x) => x.id)).toEqual(before);
    }
  });

  it("never pairs a type with its own variant", () => {
    const b747 = fleet.find((a) => a.id === "b747");
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(pickDistractors(b747, fleet, seed).map((x) => x.id)).not.toContain("b747-8");
    }
  });
});

describe("buildPack", () => {
  const recipe = {
    id: "jets",
    title: "Jets",
    path: ["Aviation", "Test"],
    accent: "#123456",
    where: { group: "fighter-attack" },
  };

  it("builds a valid pack with curated options, caption and credit", () => {
    const pack = buildPack(recipe, fleet);
    expect(pack).toMatchObject({ id: "jets", assetBase: "assets/aircraft/", theme: { accent: "#123456" }, generatedFrom: "scripts/packs/recipes.json" });
    expect(pack.questions).toHaveLength(5);
    const q = pack.questions.find((x) => x.answer === "f15");
    expect(q).toMatchObject({ id: "jets-f15", image: "f15.jpg", credit: "f15 credit" });
    expect(q.options[0]).toEqual({ id: "f15", label: "McDonnell Douglas F-15 Eagle" });
    expect(q.options).toHaveLength(4);
    expect(q.caption).toBe("McDonnell Douglas F-15 Eagle description. First flew 1972.");
  });

  it("refuses recipes that match too few aircraft", () => {
    expect(() => buildPack({ ...recipe, where: { group: "business-general" } }, fleet)).toThrow(/at least 5/);
  });
});
