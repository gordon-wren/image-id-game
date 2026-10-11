import { describe, it, expect } from "vitest";
import { buildCategoryTree, countPacks, nodeAccent, nodeChain, packPathIds } from "./categories";
import type { QuestionPack } from "./types";

const make = (id: string, extra: Partial<QuestionPack> = {}): QuestionPack => ({
  id,
  title: id,
  theme: { accent: `#${id}` },
  questions: [{ id: "q", image: "x.jpg", answer: "a" }],
  ...extra,
});

const packs = [
  make("airliners", { path: ["Aviation", "Planes", "Commercial"], categoryDescription: "Things that fly." }),
  make("fighters", { path: ["Aviation", "Planes", "Military"] }),
  make("helis", { path: ["Aviation", "Helicopters"] }),
  make("cars", { category: "Auto" }),
  make("misc"),
];

describe("buildCategoryTree", () => {
  const root = buildCategoryTree(packs);

  it("nests packs by path, preserving first-seen order", () => {
    expect(root.children.map((c) => c.title)).toEqual(["Aviation", "Auto", "Other"]);
    const aviation = root.children[0];
    expect(aviation.children.map((c) => c.id)).toEqual(["planes", "helicopters"]);
    expect(aviation.children[0].children.map((c) => c.id)).toEqual(["commercial", "military"]);
    expect(aviation.children[1].packs.map((p) => p.id)).toEqual(["helis"]);
  });

  it("falls back to category, then Other, as a one-level path", () => {
    expect(root.children[1].packs.map((p) => p.id)).toEqual(["cars"]);
    expect(root.children[2].packs.map((p) => p.id)).toEqual(["misc"]);
  });

  it("merges segments that slug the same", () => {
    const tree = buildCategoryTree([
      make("a", { path: ["Aviation", "Planes"] }),
      make("b", { path: ["aviation ", "PLANES"] }),
    ]);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].children[0].packs.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("attaches categoryDescription to the top-level category", () => {
    expect(root.children[0].description).toBe("Things that fly.");
    expect(root.children[0].children[0].description).toBeUndefined();
  });

  it("counts packs and finds an accent across the subtree", () => {
    expect(countPacks(root.children[0])).toBe(3);
    expect(nodeAccent(root.children[0])).toBe("#airliners");
  });
});

describe("nodeChain", () => {
  const root = buildCategoryTree(packs);

  it("walks a pack's path ids down to its folder", () => {
    const chain = nodeChain(root, packPathIds(packs[1]));
    expect(chain.map((n) => n.id)).toEqual(["", "aviation", "planes", "military"]);
    expect(chain[3].packs[0].id).toBe("fighters");
  });

  it("stops at the first unknown id", () => {
    expect(nodeChain(root, ["aviation", "boats", "planes"]).map((n) => n.id)).toEqual(["", "aviation"]);
  });
});
