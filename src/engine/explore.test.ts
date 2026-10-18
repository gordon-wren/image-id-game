import { describe, it, expect } from "vitest";
import { buildExplorePack, buildFlow, canGroupBy, layoutFlow, type ExploreAircraft, type ExploreData } from "./explore";

const plane = (id: string, over: Partial<ExploreAircraft>): ExploreAircraft => ({
  id, label: `Plane ${id}`, use: "military", nation: "United States", era: "WWII", role: "Fighters", maker: "Boeing", conflicts: [],
  group: "fighter-attack", countryOfOrigin: ["United States"], firstFlight: "1940", manufacturer: ["Boeing"], description: null,
  photo: { file: `assets/aircraft/${id}.jpg`, credit: "credit" }, thumb: `assets/aircraft-thumbs/${id}.jpg`, ...over,
});

// 6 US WWII fighters, 5 Soviet post-war fighters, 2 French jets, 1 civil airliner.
const aircraft = [
  ...[1, 2, 3, 4, 5, 6].map((i) => plane(`us${i}`, { conflicts: i <= 2 ? ["WWII", "Korean War"] : i <= 5 ? ["WWII"] : [] })),
  ...[1, 2, 3, 4, 5].map((i) => plane(`ru${i}`, { nation: "Soviet Union & Russia", era: "Early Cold War", maker: "Mikoyan" })),
  plane("fr1", { nation: "France", era: "Modern", maker: "Dassault" }),
  plane("fr2", { nation: "France", era: "Modern", maker: "Dassault" }),
  plane("civ", { use: "civil", nation: "United States", era: "Modern", role: "Widebody airliners", maker: "Boeing" }),
];
const data: ExploreData = { minAircraft: 5, questionsPerRound: 20, eras: ["WWII", "Early Cold War", "Modern", "Not yet in service"], aircraft };
const names = (flow: ReturnType<typeof buildFlow>, column: number) => flow.nodes.filter((n) => n.column === column).map((n) => `${n.name}:${n.ids.length}`);

describe("buildFlow", () => {
  it("bundles countries and makers below the minimum", () => {
    const flow = buildFlow(data, "nation", "maker");
    expect(names(flow, 2)).toEqual(["United States:7", "Soviet Union & Russia:5", "Other countries:2"]);
    expect(names(flow, 3)).toEqual(["Boeing:7", "Mikoyan:5", "Other manufacturers:2"]);
  });

  it("keeps eras in chronological order, whatever their size", () => {
    expect(names(buildFlow(data, "era", "role"), 2)).toEqual(["WWII:6", "Early Cold War:5", "Modern:3"]);
  });

  it("splits military and civil, military first, and links them in", () => {
    const flow = buildFlow(data, "nation", "role");
    expect(names(flow, 1)).toEqual(["Military:13", "Civil:1"]);
    expect(flow.links.find((l) => l.source === "use:civil" && l.target === "group:United States")?.ids).toEqual(["civ"]);
  });

  it("flows an aircraft into every conflict it served in, bundling small conflicts", () => {
    // WWII: us1–us5. Korean War: us1, us2 (too few, so bundled).
    const flow = buildFlow(data, "conflict", "role");
    expect(names(flow, 2)).toEqual(["WWII:5", "Other conflicts:2", "No conflict recorded:8", "Civil (no conflicts):1"]);
    expect(flow.nodes.find((n) => n.name === "Other conflicts")!.ids).toEqual(["us1", "us2"]);
    // us1 reaches Fighters through both WWII and the bundle.
    expect(flow.links.filter((l) => l.target === "last:Fighters" && l.ids.includes("us1")).map((l) => l.source)).toEqual(["group:WWII", "group:Other conflicts"]);
  });
});

describe("canGroupBy", () => {
  it("offers conflicts only once some aircraft have them", () => {
    expect(canGroupBy(data, "conflict")).toBe(true);
    expect(canGroupBy({ ...data, aircraft: aircraft.map((a) => ({ ...a, conflicts: [] })) }, "conflict")).toBe(false);
    expect(canGroupBy(data, "nation")).toBe(true);
  });
});

describe("layoutFlow", () => {
  const layout = layoutFlow(buildFlow(data, "nation", "role"), { width: 800, height: 400 });

  it("keeps every bar inside the chart and sizes bars by aircraft", () => {
    for (const n of layout.nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + n.height).toBeLessThanOrEqual(400.0001);
    }
    const us = layout.nodes.find((n) => n.name === "United States")!;
    const ru = layout.nodes.find((n) => n.name === "Soviet Union & Russia")!;
    expect(us.height / ru.height).toBeCloseTo(7 / 5, 5);
  });

  it("places columns left to right", () => {
    const xs = [0, 1, 2, 3].map((c) => layout.nodes.find((n) => n.column === c)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);
  });

  it("draws one closed ribbon per link", () => {
    expect(layout.links).toHaveLength(buildFlow(data, "nation", "role").links.length);
    for (const l of layout.links) expect(l.path).toMatch(/^M.*Z$/);
  });
});

describe("buildExplorePack", () => {
  it("builds a set from a selection, with wrong answers from the same set", () => {
    const pack = buildExplorePack(data, { title: "United States", context: "Country", ids: ["us1", "us2", "us3", "us4", "us5", "us6"] }, "#123456")!;
    expect(pack).toMatchObject({ id: "explore-country-united-states", title: "United States", questionsPerRound: 20, assetBase: "assets/aircraft/" });
    expect(pack.questions).toHaveLength(6);
    for (const q of pack.questions) expect(q.options!.every((o) => o.id.startsWith("us"))).toBe(true);
  });

  it("refuses a selection with fewer than the minimum", () => {
    expect(buildExplorePack(data, { title: "France", context: "Country", ids: ["fr1", "fr2"] }, "#123456")).toBeNull();
  });
});
