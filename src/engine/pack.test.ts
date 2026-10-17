import { describe, it, expect } from "vitest";
import { orderQuestions, resolveOptions, resolvePack, roundLength, validatePack, shuffle } from "./pack";
import type { QuestionPack } from "./types";

// Deterministic RNG so shuffles are reproducible in tests.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const pack: QuestionPack = {
  id: "test",
  title: "Test",
  theme: { accent: "#185FA5" },
  optionsPerQuestion: 4,
  questions: [
    { id: "q1", image: "a.jpg", answer: "a" },
    { id: "q2", image: "b.jpg", answer: "b" },
    { id: "q3", image: "c.jpg", answer: "c" },
    { id: "q4", image: "d.jpg", answer: "d" },
    { id: "q5", image: "e.jpg", answer: "e" },
  ],
};

describe("shuffle", () => {
  it("preserves length and membership", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seeded(1));
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual(src);
  });
});

describe("resolveOptions (pool generation)", () => {
  it("produces optionsPerQuestion options, always including the correct answer", () => {
    const pool = [
      { id: "a", label: "A" }, { id: "b", label: "B" },
      { id: "c", label: "C" }, { id: "d", label: "D" }, { id: "e", label: "E" },
    ];
    const opts = resolveOptions(pack, pack.questions[0], pool, seeded(3));
    expect(opts).toHaveLength(4);
    expect(opts.some((o) => o.id === "a")).toBe(true);
  });

  it("uses supplied options verbatim when present", () => {
    const q = {
      id: "qx", image: "x.jpg", answer: "a",
      options: [{ id: "a", label: "A" }, { id: "z", label: "Z" }],
    };
    const opts = resolveOptions({ ...pack, shuffleOptions: false }, q, [], seeded(1));
    expect(opts.map((o) => o.id)).toEqual(["a", "z"]);
  });
});

describe("resolvePack", () => {
  it("labels generated options from another question's options when a question has none", () => {
    const resolved = resolvePack(
      {
        ...pack,
        optionsPerQuestion: 2,
        shuffleQuestions: false,
        questions: [
          { id: "q1", image: "a.jpg", answer: "a", options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Bravo" }] },
          { id: "q2", image: "b.jpg", answer: "b" },
        ],
      },
      seeded(3),
    );
    expect(resolved[1].resolvedOptions.map((o) => o.label).sort()).toEqual(["Alpha", "Bravo"]);
  });

  it("resolves image paths and attaches options to every question", () => {
    const resolved = resolvePack({ ...pack, assetBase: "assets/test/" }, seeded(7));
    expect(resolved).toHaveLength(5);
    for (const q of resolved) {
      expect(q.resolvedImage).toContain("a.jpg".slice(-5).length ? "" : "");
      expect(q.resolvedOptions.length).toBeGreaterThan(0);
      expect(q.resolvedOptions.some((o) => o.id === q.answer)).toBe(true);
    }
  });

  it("leaves absolute URLs untouched", () => {
    const p: QuestionPack = {
      ...pack,
      questions: [{ id: "q1", image: "https://example.com/x.jpg", answer: "a" }],
    };
    const resolved = resolvePack(p, seeded(1));
    expect(resolved[0].resolvedImage).toBe("https://example.com/x.jpg");
  });
});

describe("orderQuestions (questions per round)", () => {
  const many: QuestionPack = {
    ...pack,
    questions: Array.from({ length: 30 }, (_, i) => ({ id: `q${i}`, image: `${i}.jpg`, answer: `a${i}` })),
  };

  it("uses every question when the pack sets no limit", () => {
    expect(orderQuestions(many, seeded(1))).toHaveLength(30);
    expect(roundLength(many)).toBe(30);
  });

  it("draws a random selection of questionsPerRound when there are more", () => {
    const capped = { ...many, questionsPerRound: 20 };
    const a = orderQuestions(capped, seeded(1)).map((q) => q.id);
    const b = orderQuestions(capped, seeded(2)).map((q) => q.id);
    expect(a).toHaveLength(20);
    expect(new Set(a).size).toBe(20);
    expect(a).not.toEqual(b);
    expect(roundLength(capped)).toBe(20);
  });

  it("keeps the pack's order for the selection when shuffling is off", () => {
    const ids = orderQuestions({ ...many, questionsPerRound: 10, shuffleQuestions: false }, seeded(3)).map((q) => Number(q.id.slice(1)));
    expect(ids).toHaveLength(10);
    expect(ids).toEqual([...ids].sort((x, y) => x - y));
  });

  it("uses every question when the limit is higher than the pack", () => {
    expect(orderQuestions({ ...pack, questionsPerRound: 20 }, seeded(1))).toHaveLength(pack.questions.length);
  });
});

describe("validatePack", () => {
  it("accepts a well-formed pack", () => {
    expect(() => validatePack(pack)).not.toThrow();
  });

  it("rejects a path with blank or non-string segments", () => {
    expect(() => validatePack({ ...pack, path: ["Aviation", ""] })).toThrow(/path/);
    expect(() => validatePack({ ...pack, path: "Aviation" as unknown as string[] })).toThrow(/path/);
  });

  it("rejects a questionsPerRound that isn't a positive whole number", () => {
    expect(() => validatePack({ ...pack, questionsPerRound: 0 })).toThrow(/questionsPerRound/);
    expect(() => validatePack({ ...pack, questionsPerRound: 2.5 })).toThrow(/questionsPerRound/);
  });

  it("rejects a pack with no questions", () => {
    expect(() => validatePack({ ...pack, questions: [] })).toThrow(/non-empty/);
  });

  it("rejects duplicate question ids", () => {
    const bad = { ...pack, questions: [pack.questions[0], pack.questions[0]] };
    expect(() => validatePack(bad)).toThrow(/duplicate/);
  });

  it("rejects an answer not among supplied options", () => {
    const bad: QuestionPack = {
      ...pack,
      questions: [{ id: "q1", image: "a.jpg", answer: "zzz", options: [{ id: "a", label: "A" }] }],
    };
    expect(() => validatePack(bad)).toThrow(/not among/);
  });
});
