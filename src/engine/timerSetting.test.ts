import { describe, it, expect } from "vitest";
import { TIMER_SECONDS, formatSeconds, parseTimerSetting, roundSeconds } from "./timerSetting";
import type { QuestionPack } from "./types";

const pack = (roundSeconds?: number): QuestionPack => ({
  id: "p",
  title: "P",
  theme: { accent: "#000000" },
  roundSeconds,
  questions: [{ id: "q", image: "q.jpg", answer: "a" }],
});

describe("roundSeconds", () => {
  it("uses the pack's time by default, doubled for typed answers", () => {
    expect(roundSeconds(pack(9), "pack", "choices")).toBe(9);
    expect(roundSeconds(pack(9), "pack", "typed")).toBe(18);
    expect(roundSeconds(pack(), "pack", "choices")).toBe(7);
  });

  it("uses a chosen time exactly, whatever the pack or answer mode", () => {
    expect(roundSeconds(pack(9), 30, "choices")).toBe(30);
    expect(roundSeconds(pack(9), 30, "typed")).toBe(30);
  });

  it("keeps the pack's time when off, for scoring the speed bonus", () => {
    expect(roundSeconds(pack(9), "off", "choices")).toBe(9);
  });
});

describe("formatSeconds", () => {
  it("formats seconds and minutes", () => {
    expect(TIMER_SECONDS.map(formatSeconds)).toEqual(["10s", "15s", "20s", "30s", "45s", "1 min", "1 min 30s", "2 min"]);
  });
});

describe("parseTimerSetting", () => {
  it("round-trips every option", () => {
    for (const v of ["off", "pack", ...TIMER_SECONDS] as const) {
      expect(parseTimerSetting(String(v))).toBe(v);
    }
  });

  it("falls back to the pack's time for missing or unknown values", () => {
    expect(parseTimerSetting(null)).toBe("pack");
    expect(parseTimerSetting("7")).toBe("pack");
    expect(parseTimerSetting("banana")).toBe("pack");
  });
});
