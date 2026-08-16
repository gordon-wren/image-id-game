import { describe, it, expect } from "vitest";
import { score, DEFAULT_SCORE_CONFIG } from "./scoring";

const ROUND = 7000;

describe("score", () => {
  it("gives 0 for a wrong answer no matter how fast", () => {
    expect(score(false, 0, ROUND)).toBe(0);
    expect(score(false, 3000, ROUND)).toBe(0);
  });

  it("gives base + full bonus for an instant correct answer", () => {
    expect(score(true, 0, ROUND)).toBe(
      DEFAULT_SCORE_CONFIG.base + DEFAULT_SCORE_CONFIG.speedBonus
    );
  });

  it("gives base only for a correct answer at the buzzer", () => {
    expect(score(true, ROUND, ROUND)).toBe(DEFAULT_SCORE_CONFIG.base);
  });

  it("scales the bonus linearly with time remaining", () => {
    // Half the time used -> half the bonus.
    expect(score(true, ROUND / 2, ROUND)).toBe(
      DEFAULT_SCORE_CONFIG.base + DEFAULT_SCORE_CONFIG.speedBonus / 2
    );
  });

  it("clamps elapsed beyond the round to base", () => {
    expect(score(true, ROUND + 5000, ROUND)).toBe(DEFAULT_SCORE_CONFIG.base);
  });

  it("clamps negative elapsed to full bonus", () => {
    expect(score(true, -100, ROUND)).toBe(
      DEFAULT_SCORE_CONFIG.base + DEFAULT_SCORE_CONFIG.speedBonus
    );
  });

  it("always returns a non-negative integer", () => {
    const p = score(true, 1234, ROUND);
    expect(Number.isInteger(p)).toBe(true);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  it("honours a custom config", () => {
    const cfg = { base: 100, speedBonus: 100 };
    expect(score(true, 0, ROUND, cfg)).toBe(200);
    expect(score(true, ROUND, ROUND, cfg)).toBe(100);
  });
});
