import { describe, it, expect } from "vitest";
import { buildNameCatalog, fuzzySearch, sameName } from "./names";
import type { QuestionPack } from "./types";

const names = [
  "Airbus A380",
  "Boeing 747-8",
  "Boeing 747-400",
  "Boeing 777-300ER",
  "F-22 Raptor",
  "F/A-18 Hornet",
  "Sikorsky UH-60 Black Hawk",
  "Sikorsky CH-54 Skycrane",
  "Bell 206 JetRanger",
  "Eurocopter Tiger",
];

describe("fuzzySearch", () => {
  it("returns nothing for a blank query", () => {
    expect(fuzzySearch("  ", names)).toEqual([]);
  });

  it("ignores punctuation and case", () => {
    expect(fuzzySearch("f22", names)[0]).toBe("F-22 Raptor");
    expect(fuzzySearch("fa18", names)[0]).toBe("F/A-18 Hornet");
  });

  it("requires every query word to match", () => {
    expect(fuzzySearch("boeing 747", names)).toEqual(["Boeing 747-8", "Boeing 747-400"]);
    expect(fuzzySearch("sikorsky hawk", names)).toEqual(["Sikorsky UH-60 Black Hawk"]);
  });

  it("ranks word-start matches above mid-word ones", () => {
    expect(fuzzySearch("ra", names)[0]).toBe("F-22 Raptor");
  });

  it("tolerates small typos", () => {
    expect(fuzzySearch("rpator", names)).toContain("F-22 Raptor");
    expect(fuzzySearch("sikorksy", names)).toEqual(
      expect.arrayContaining(["Sikorsky UH-60 Black Hawk", "Sikorsky CH-54 Skycrane"]),
    );
  });

  it("matches abbreviations as in-order subsequences", () => {
    expect(fuzzySearch("blkhwk", names)).toEqual(["Sikorsky UH-60 Black Hawk"]);
  });

  it("respects the limit", () => {
    expect(fuzzySearch("o", names, 3)).toHaveLength(3);
  });
});

describe("buildNameCatalog", () => {
  const make = (id: string, questions: QuestionPack["questions"]): QuestionPack => ({
    id,
    title: id,
    theme: { accent: "#000" },
    questions,
  });

  it("collects options and answers across packs, deduped by normalized name", () => {
    const catalog = buildNameCatalog([
      make("a", [
        {
          id: "q1",
          image: "x",
          answer: "f22",
          options: [
            { id: "f22", label: "F-22 Raptor" },
            { id: "f35", label: "F-35 Lightning II" },
          ],
        },
      ]),
      make("b", [
        { id: "q1", image: "x", answer: "raptor", options: [{ id: "raptor", label: "f22 raptor" }] },
        { id: "q2", image: "x", answer: "Bell 47" },
      ]),
    ]);
    expect(catalog).toEqual(["Bell 47", "F-22 Raptor", "F-35 Lightning II"]);
  });
});

describe("sameName", () => {
  it("compares names ignoring punctuation, case and spacing", () => {
    expect(sameName("F/A-18 Hornet", "fa18 hornet")).toBe(true);
    expect(sameName("Boeing 747-8", "Boeing 747-400")).toBe(false);
  });
});
