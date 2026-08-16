// ============================================================================
// SCORING — one pure function, no side effects, no DOM, no React.
// Kept isolated so it's trivially testable and can be moved server-side
// (an /api/submit endpoint) unchanged the day you add a leaderboard.
// ============================================================================

export interface ScoreConfig {
  /** Points awarded for a correct answer regardless of speed. Default 300. */
  base: number;
  /** Additional points available, scaled by how fast the answer came. Default 700. */
  speedBonus: number;
}

export const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  base: 300,
  speedBonus: 700,
};

/**
 * Points for one round.
 *
 * - Wrong or timed-out answers score 0.
 * - A correct answer scores `base` plus a linear share of `speedBonus`
 *   proportional to the time remaining when answered.
 *
 * Answering instantly earns base + full bonus; answering at the buzzer
 * earns base only. Result is always a non-negative integer.
 *
 * @param correct    whether the chosen option was right
 * @param msElapsed  time from question shown to answer, in milliseconds
 * @param roundMs    total time allowed for the round, in milliseconds
 */
export function score(
  correct: boolean,
  msElapsed: number,
  roundMs: number,
  config: ScoreConfig = DEFAULT_SCORE_CONFIG
): number {
  if (!correct) return 0;
  if (roundMs <= 0) return config.base;

  const clamped = Math.min(Math.max(msElapsed, 0), roundMs);
  const remainingFraction = 1 - clamped / roundMs;
  const bonus = config.speedBonus * remainingFraction;

  return Math.round(config.base + bonus);
}
