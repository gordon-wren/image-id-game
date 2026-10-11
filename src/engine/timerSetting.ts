import type { QuestionPack } from "./types";
import type { AnswerMode } from "./useAnswerMode";
import { DEFAULTS } from "./pack";

/**
 * The player's round timer choice:
 *  - "off"  -> no countdown, rounds never time out;
 *  - "pack" -> the pack's own `roundSeconds` (doubled in typed mode);
 *  - number -> exactly this many seconds per round, whatever the pack or mode.
 */
export type TimerSetting = "off" | "pack" | number;

/** Fixed round lengths offered in the menu, in seconds. */
export const TIMER_SECONDS = [10, 15, 20, 30, 45, 60, 90, 120] as const;

/**
 * Seconds per round for this pack and setting. With the timer off there's no
 * countdown, but scoring still scales the speed bonus against the pack's time.
 */
export function roundSeconds(pack: QuestionPack, setting: TimerSetting, answerMode: AnswerMode): number {
  if (typeof setting === "number") return setting;
  const base = pack.roundSeconds ?? DEFAULTS.roundSeconds;
  return answerMode === "typed" ? base * DEFAULTS.typedTimeMultiplier : base;
}

/** "10s", "1 min", "1 min 30s". */
export function formatSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  const min = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${min} min ${rest}s` : `${min} min`;
}

/** Reads a stored setting back, falling back to the pack's time for anything unrecognised. */
export function parseTimerSetting(raw: string | null): TimerSetting {
  if (raw === "off") return "off";
  const n = Number(raw);
  if ((TIMER_SECONDS as readonly number[]).includes(n)) return n;
  return "pack";
}
