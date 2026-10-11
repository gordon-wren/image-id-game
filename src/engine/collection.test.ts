import { describe, it, expect } from "vitest";
import {
  emptyRecord,
  entryKey,
  formatNumber,
  isCaught,
  markViewed,
  mergeRecords,
  packEntries,
  parseRecord,
  progress,
  recordAnswer,
  type Catalog,
} from "./collection";

const t1 = new Date("2026-10-11T10:00:00Z");
const t2 = new Date("2026-10-11T11:00:00Z");

const entry = (number: number, packs: string[]) => ({ number, name: `A${number}`, image: "x.jpg", credit: null, packs });
const catalog: Catalog = {
  entries: { f16: entry(2, ["jets", "coldwar"]), f15: entry(1, ["jets"]), "liners/b777er": entry(3, ["liners"]) },
  aliases: { "jets/f16": "f16", "jets/f15": "f15", "coldwar/f16": "f16", "liners/b777er": "liners/b777er" },
};

describe("recordAnswer", () => {
  it("catches on the first correct answer, and only reports it once", () => {
    let r = recordAnswer(emptyRecord(t1), "f16", false, t1).record;
    expect(isCaught(r, "f16")).toBe(false);

    const first = recordAnswer(r, "f16", true, t2);
    expect(first.newCatch).toBe(true);
    r = first.record;
    expect(r.entries.f16).toEqual({ seen: 2, correct: 1, viewed: false, firstCaughtAt: t2.toISOString() });

    const again = recordAnswer(r, "f16", true, t2);
    expect(again.newCatch).toBe(false);
    expect(again.record.entries.f16.firstCaughtAt).toBe(t2.toISOString());
  });

  it("never un-catches on a wrong answer or timeout", () => {
    const caught = recordAnswer(emptyRecord(t1), "f16", true, t1).record;
    const missed = recordAnswer(caught, "f16", false, t2).record;
    expect(isCaught(missed, "f16")).toBe(true);
    expect(missed.entries.f16).toMatchObject({ seen: 2, correct: 1 });
  });

  it("doesn't mutate the record it was given", () => {
    const r = emptyRecord(t1);
    recordAnswer(r, "f16", true, t1);
    expect(r.entries).toEqual({});
  });
});

describe("markViewed", () => {
  it("clears the New tag on caught entries only", () => {
    const caught = recordAnswer(emptyRecord(t1), "f16", true, t1).record;
    expect(markViewed(caught, "f16", t2).entries.f16.viewed).toBe(true);
    const uncaught = recordAnswer(emptyRecord(t1), "f15", false, t1).record;
    expect(markViewed(uncaught, "f15", t2)).toBe(uncaught);
  });
});

describe("mergeRecords", () => {
  const a = recordAnswer(recordAnswer(emptyRecord(t1), "f16", true, t2).record, "f16", false, t2).record; // caught later, seen 2
  const b = {
    ...recordAnswer(recordAnswer(emptyRecord(t1), "f16", true, t1).record, "f15", false, t1).record,
    updatedAt: t1.toISOString(),
  }; // caught earlier, seen 1

  it("keeps every catch, the earliest catch time and the larger counts", () => {
    const m = mergeRecords(a, b);
    expect(m.entries.f16).toEqual({ seen: 2, correct: 1, viewed: false, firstCaughtAt: t1.toISOString() });
    expect(m.entries.f15).toEqual({ seen: 1, correct: 0, viewed: false });
    expect(m.updatedAt).toBe(t2.toISOString());
  });

  it("gives the same result however many times it runs", () => {
    const once = mergeRecords(a, b);
    expect(mergeRecords(once, b)).toEqual(once);
    expect(mergeRecords(mergeRecords(once, a), b)).toEqual(once);
  });
});

describe("parseRecord", () => {
  it("starts fresh for missing, corrupt or unknown-version data", () => {
    for (const raw of [null, "not json", JSON.stringify({ version: 2, entries: {} })]) {
      expect(parseRecord(raw).entries).toEqual({});
    }
  });

  it("keeps entries the catalog no longer has", () => {
    const r = recordAnswer(emptyRecord(t1), "retired/x", true, t1).record;
    expect(parseRecord(JSON.stringify(r)).entries["retired/x"].firstCaughtAt).toBe(t1.toISOString());
  });
});

describe("catalog helpers", () => {
  it("maps pack questions to entries, sharing one entry across packs", () => {
    expect(entryKey(catalog, "jets", "f16")).toBe("f16");
    expect(entryKey(catalog, "coldwar", "f16")).toBe("f16");
    expect(entryKey(catalog, "jets", "nope")).toBeUndefined();
  });

  it("lists a pack's entries in number order and counts progress", () => {
    expect(packEntries(catalog, "jets")).toEqual(["f15", "f16"]);
    const r = recordAnswer(emptyRecord(t1), "f16", true, t1).record;
    expect(progress(r, packEntries(catalog, "jets"))).toEqual({ caught: 1, total: 2 });
    expect(progress(r, packEntries(catalog, "coldwar"))).toEqual({ caught: 1, total: 1 });
  });

  it("formats entry numbers", () => {
    expect(formatNumber(7)).toBe("#007");
    expect(formatNumber(1234)).toBe("#1234");
  });
});
