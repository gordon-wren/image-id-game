import { describe, it, expect } from "vitest";
import { cryptoRandom, sample } from "./random";

describe("cryptoRandom", () => {
  it("returns floats in [0, 1) that vary", () => {
    const values = Array.from({ length: 1000 }, cryptoRandom);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBeGreaterThan(990);
  });
});

describe("sample", () => {
  const items = Array.from({ length: 30 }, (_, i) => i);

  it("picks k distinct items from the list", () => {
    const picked = sample(items, 20);
    expect(picked).toHaveLength(20);
    expect(new Set(picked).size).toBe(20);
    expect(picked.every((x) => items.includes(x))).toBe(true);
  });

  it("returns everything, shuffled, when k is at least the length", () => {
    expect([...sample(items, 50)].sort((a, b) => a - b)).toEqual(items);
  });

  it("gives every item a fair chance", () => {
    // 3,000 draws of 5 from 10: each item expected 1,500 times.
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 3000; i++) for (const x of sample(items.slice(0, 10), 5)) counts[x]++;
    expect(Math.min(...counts)).toBeGreaterThan(1300);
    expect(Math.max(...counts)).toBeLessThan(1700);
  });

  it("doesn't change the list it was given", () => {
    const copy = items.slice();
    sample(items, 10);
    expect(items).toEqual(copy);
  });
});
