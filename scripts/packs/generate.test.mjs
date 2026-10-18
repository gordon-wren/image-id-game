import { describe, it, expect } from "vitest";
import { buildCatalog, buildExplore, buildPack, expandTaxonomy, firstSentences, foldSingleItemFolders, makerOf, nationOf, pickDistractors, roleOf, selectAircraft, similarity } from "./generate.mjs";

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

  it("filters by use, category and engine", () => {
    const tagged = fleet.map((a) => ({ ...a, use: a.group === "business-general" ? "civil" : "military", engine: a.id === "f15" ? "piston" : "jet", category: a.id === "su27" ? "attack" : "fighter" }));
    expect(selectAircraft(tagged, { group: "fighter-attack", engine: "jet" }).map((a) => a.id)).toEqual(["f16", "su27", "su35", "mig29"]);
    expect(selectAircraft(tagged, { category: ["attack"] }).map((a) => a.id)).toEqual(["su27"]);
    expect(selectAircraft(tagged, { use: "civil" }).map((a) => a.id)).toEqual(["c172"]);
  });

  it("combines conditions and honours ids", () => {
    expect(selectAircraft(fleet, { group: "fighter-attack", ids: ["f15", "mig29", "a380"] }).map((a) => a.id)).toEqual(["f15", "mig29"]);
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
    expect(pack).toMatchObject({ id: "jets", assetBase: "assets/aircraft/", theme: { accent: "#123456" }, generatedFrom: "scripts/packs/taxonomy.json" });
    expect(pack.questions).toHaveLength(5);
    const q = pack.questions.find((x) => x.answer === "f15");
    expect(q).toMatchObject({ id: "jets-f15", image: "f15.jpg", credit: "f15 credit" });
    expect(q.options[0]).toEqual({ id: "f15", label: "McDonnell Douglas F-15 Eagle" });
    expect(q.options).toHaveLength(4);
    expect(q.caption).toBe("McDonnell Douglas F-15 Eagle description. First flew 1972.");
  });

  it("draws wrong answers only from the set's own aircraft", () => {
    const pack = buildPack({ ...recipe, where: { ids: ["f15", "f16", "su27", "mig29", "a380"] } }, fleet);
    const members = new Set(["f15", "f16", "su27", "mig29", "a380"]);
    for (const q of pack.questions) expect(q.options.every((o) => members.has(o.id)), q.id).toBe(true);
  });

  it("tops up from the wider dataset only when the set has too few candidates", () => {
    // For the 747 only the 777 and A380 qualify: the 747-8 is its own variant.
    const pack = buildPack({ ...recipe, where: { ids: ["b747", "b747-8", "b777", "a380"] } }, fleet, 4);
    const q = pack.questions.find((x) => x.answer === "b747");
    const wrong = q.options.filter((o) => o.id !== "b747").map((o) => o.id);
    expect(wrong).toHaveLength(3);
    expect(wrong).toEqual(expect.arrayContaining(["b777", "a380"]));
    expect(wrong).not.toContain("b747-8");
    expect(wrong.filter((id) => !["b747-8", "b777", "a380"].includes(id))).toHaveLength(1);
  });

  it("refuses recipes that match too few aircraft", () => {
    expect(() => buildPack({ ...recipe, where: { group: "business-general" } }, fleet)).toThrow(/at least 5/);
  });
});

describe("firstSentences", () => {
  it("takes the first two sentences without splitting after initials", () => {
    const text = "The C-130 is a U.S. transport. It first flew in 1954. It is still built.";
    expect(firstSentences(text)).toBe("The C-130 is a U.S. transport. It first flew in 1954.");
  });

  it("returns short text whole and caps long text at a word", () => {
    expect(firstSentences("Just one sentence")).toBe("Just one sentence");
    const long = firstSentences("word ".repeat(200) + ".");
    expect(long.length).toBeLessThanOrEqual(320);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("buildCatalog", () => {
  const withSummary = fleet.map((a) => ({ ...a, name: a.label, summary: `${a.label} is a plane. It flies.`, wikipedia: { title: a.label, url: `https://w/${a.id}` } }));
  const jets = { id: "jets", assetBase: "assets/aircraft/", questions: [{ id: "j1", image: "f15.jpg", answer: "f15" }, { id: "j2", image: "su27.jpg", answer: "su27" }] };
  const russia = { id: "russia", assetBase: "assets/aircraft/", questions: [{ id: "r1", image: "su27.jpg", answer: "su27" }] };
  const variants = {
    id: "variants",
    assetBase: "assets/variants/",
    questions: [{ id: "v1", image: "777er.jpg", answer: "777er", caption: "Cap", credit: "Someone", options: [{ id: "777er", label: "Boeing 777-300ER" }] }],
  };
  const packs = [["jets.json", jets], ["russia.json", russia], ["variants.json", variants]];

  it("makes one entry per aircraft, listing every pack it's in", () => {
    const c = buildCatalog(packs, withSummary, null);
    expect(Object.keys(c.entries)).toEqual(["f15", "su27", "variants/777er"]);
    expect(c.entries.su27.packs).toEqual(["jets", "russia"]);
    expect(c.aliases).toEqual({ "jets/f15": "f15", "jets/su27": "su27", "russia/su27": "su27", "variants/777er": "variants/777er" });
  });

  it("takes facts from the dataset and the rest from the question", () => {
    const c = buildCatalog(packs, withSummary, null);
    expect(c.entries.f15).toMatchObject({ name: "McDonnell Douglas F-15 Eagle", image: "assets/aircraft/f15.jpg", credit: "f15 credit" });
    expect(c.entries.f15.facts).toMatchObject({ firstFlight: 1972, country: "United States", about: "McDonnell Douglas F-15 Eagle is a plane. It flies.", wikipedia: "https://w/f15" });
    expect(c.entries["variants/777er"]).toEqual({
      number: 3, name: "Boeing 777-300ER", image: "assets/variants/777er.jpg", credit: "Someone", packs: ["variants"], caption: "Cap",
    });
  });

  it("keeps numbers permanent: existing ones stay, new ones append, removed ones are never reused", () => {
    const first = buildCatalog(packs, withSummary, null);
    expect(first.numbers).toEqual({ f15: 1, su27: 2, "variants/777er": 3 });
    // Drop the jets pack and add a new aircraft in front of the rest.
    const later = buildCatalog([["new.json", { id: "new", assetBase: "assets/aircraft/", questions: [{ id: "n1", image: "a380.jpg", answer: "a380" }] }], ...packs.slice(1)], withSummary, first);
    expect(later.entries.su27.number).toBe(2);
    expect(later.entries.a380.number).toBe(4);
    expect(later.entries.f15).toBeUndefined();
    expect(later.numbers.f15).toBe(1);
  });
});

describe("nationOf", () => {
  it("files an aircraft under one country, folding old names, or Multinational", () => {
    const aliases = { "Soviet Union": "Soviet Union & Russia", Russia: "Soviet Union & Russia", "German Reich": "Germany" };
    expect(nationOf({ countryOfOrigin: ["Soviet Union", "Russia"] }, aliases)).toBe("Soviet Union & Russia");
    expect(nationOf({ countryOfOrigin: ["German Reich"] }, aliases)).toBe("Germany");
    expect(nationOf({ countryOfOrigin: ["France", "Germany"] }, aliases)).toBe("Multinational");
    expect(nationOf({ countryOfOrigin: ["Italy / UK"] }, aliases)).toBe("Multinational");
    expect(nationOf({ countryOfOrigin: [] }, aliases)).toBe(null);
  });
});

describe("expandTaxonomy", () => {
  // Six US fighters in the 1940s, two in the 1950s, five Soviet ones in the 1950s.
  const jet = (id, country, introduced, category = "fighter") => ({
    ...plane(id, `Plane ${id}`, "fighter-attack", country, `${introduced}-01-01`), introduced: `${introduced}-06-01`, use: "military", category,
  });
  const corpus = [
    ...["a", "b", "c", "d", "e", "f"].map((x) => jet(`us4${x}`, "United States", 1943)),
    jet("us5a", "United States", 1953), jet("us5b", "United States", 1955),
    ...["a", "b", "c", "d", "e"].map((x) => jet(`ru5${x}`, "Soviet Union", 1955)),
    { ...jet("future", "United States", 2030), introduced: null },
  ];
  const taxonomy = {
    minAircraft: 5,
    questionsPerRound: 20,
    eras: [{ id: "wwii", name: "WWII", from: 1939, to: 1945 }, { id: "postwar", name: "Postwar", from: 1946 }],
    nationAliases: { "Soviet Union": "Soviet Union & Russia" },
    menus: [
      { id: "m-era", path: ["Aviation", "By Era"], where: { use: "military" }, by: "era", accent: "#111111" },
      { id: "m-decade", path: ["Aviation", "By Decade"], where: { use: "military" }, by: "decade", accent: "#222222" },
      { id: "m-country", path: ["Aviation", "By Country"], where: { use: "military" }, by: "nation", then: "era", accent: "#333333" },
      { id: "m-role", path: ["Aviation", "By Role"], where: { use: "military" }, accent: "#444444", sets: [
        { id: "fighters", name: "Fighters", description: "Fighters.", where: { category: "fighter" } },
        { id: "bombers", name: "Bombers", description: "Bombers.", where: { category: "bomber" } },
      ] },
    ],
  };
  const recipes = expandTaxonomy(taxonomy, corpus);
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));

  it("keeps only sets with enough aircraft, placing them by service year", () => {
    expect(byId["m-era-wwii"].where.ids).toHaveLength(6);
    expect(byId["m-era-postwar"].where.ids).toHaveLength(7);
    expect(byId["m-decade-1940s"].where.ids).toHaveLength(6);
    expect(byId["m-decade-1950s"].where.ids).toHaveLength(7);
    expect(recipes.some((r) => r.where.ids.includes("future") && /era|decade/.test(r.id))).toBe(false);
    expect(byId["m-role-bombers"]).toBeUndefined();
    expect(byId["m-era-wwii"]).toMatchObject({ title: "WWII", path: ["Aviation", "By Era"], questionsPerRound: 20, description: "Military aircraft that entered service 1939–1945." });
  });

  it("nests a country's era sets in a folder only when they qualify", () => {
    // US: 9 in all, but only WWII (6) has enough for an era set.
    expect(byId["m-country-united-states"]).toMatchObject({ title: "United States: all eras", path: ["Aviation", "By Country", "United States"] });
    expect(byId["m-country-united-states-wwii"]).toMatchObject({ title: "United States: WWII", path: ["Aviation", "By Country", "United States"] });
    // Soviet: 5, and no era split qualifies, so a single set.
    expect(byId["m-country-soviet-union-and-russia"]).toMatchObject({ title: "Soviet Union & Russia", path: ["Aviation", "By Country"] });
  });
});

describe("foldSingleItemFolders", () => {
  const r = (id, path) => ({ id, path });

  it("moves a folder's only item up into its parent", () => {
    const out = foldSingleItemFolders([r("a", ["Top", "Mid", "Leaf"]), r("b", ["Top", "Other"]), r("c", ["Top", "Other"])]);
    expect(out.find((x) => x.id === "a").path).toEqual(["Top"]);
  });

  it("folds a folder whose only item is a sub-folder", () => {
    const out = foldSingleItemFolders([r("a", ["Top", "Mid", "Leaf"]), r("b", ["Top", "Mid", "Leaf"]), r("c", ["Top", "Other"]), r("d", ["Top", "Other"])]);
    expect(out.find((x) => x.id === "a").path).toEqual(["Top", "Leaf"]);
  });

  it("leaves top-level folders and folders holding a hand-written pack", () => {
    const out = foldSingleItemFolders([r("a", ["Solo"]), r("b", ["Top", "Hand"])], [["Top", "Hand"]]);
    expect(out.map((x) => x.path)).toEqual([["Solo"], ["Top", "Hand"]]);
  });
});

describe("Explore data", () => {
  const taxonomy = {
    minAircraft: 5, questionsPerRound: 20,
    eras: [{ id: "wwii", name: "WWII", from: 1939, to: 1945 }],
    nationAliases: { "Soviet Union": "Soviet Union & Russia" },
    makerAliases: { "Mil Moscow Helicopter Plant": "Mil" },
    menus: [
      { id: "roles", path: ["A"], where: { use: "military" }, sets: [
        { id: "fighters", name: "Fighters", where: { category: "fighter" } },
        { id: "helicopters", name: "Military helicopters", where: { category: ["utility-helicopter", "attack-helicopter"] } },
      ] },
      { id: "civil", path: ["B"], where: { use: "civil" }, sets: [{ id: "heli", name: "Civil helicopters", where: { category: "utility-helicopter" } }] },
    ],
  };
  const mi8 = { ...plane("mi8", "Mil Mi-8", "helicopter", "Soviet Union", "1961"), introduced: "1967", use: "military", category: "utility-helicopter", manufacturer: ["Mil Moscow Helicopter Plant"] };
  const r22 = { ...plane("r22", "Robinson R22", "helicopter", "United States", "1975"), introduced: "1979", use: "civil", category: "utility-helicopter", manufacturer: ["Robinson"] };

  it("files role by the first matching taxonomy set, respecting the menu's use", () => {
    expect(roleOf(mi8, taxonomy)).toBe("Military helicopters");
    expect(roleOf(r22, taxonomy)).toBe("Civil helicopters");
    expect(roleOf({ ...r22, category: "experimental" }, taxonomy)).toBe("Other");
  });

  it("folds production plants and divisions into the maker's name", () => {
    expect(makerOf(mi8, taxonomy.makerAliases)).toBe("Mil");
    expect(makerOf(r22, taxonomy.makerAliases)).toBe("Robinson");
  });

  it("gives each aircraft with a photo its country, era by service year, role and maker", () => {
    const noPhoto = { ...r22, id: "nophoto", photo: null };
    const out = buildExplore(taxonomy, [mi8, r22, noPhoto]);
    expect(out.eras).toEqual(["WWII", "Not yet in service"]);
    expect(out.aircraft.map((a) => a.id)).toEqual(["mi8", "r22"]);
    expect(out.aircraft[0]).toMatchObject({ nation: "Soviet Union & Russia", era: "Not yet in service", role: "Military helicopters", maker: "Mil", conflicts: [] });
  });
});

