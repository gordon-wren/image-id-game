import { useEffect, useRef, useState, useCallback } from "react";

/**
 * A countdown timer measured against wall-clock time (so it stays accurate
 * even if the tab throttles rAF/intervals). Returns remaining ms, a helper
 * to read elapsed ms at answer time, and start/stop controls.
 */
export function useTimer(roundMs: number) {
  const [remaining, setRemaining] = useState(roundMs);
  const startedAt = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const running = useRef(false);

  const tick = useCallback(() => {
    if (!running.current || startedAt.current == null) return;
    const elapsed = performance.now() - startedAt.current;
    const left = Math.max(0, roundMs - elapsed);
    setRemaining(left);
    if (left <= 0) {
      running.current = false;
      return;
    }
    raf.current = requestAnimationFrame(tick);
  }, [roundMs]);

  const start = useCallback(() => {
    stop();
    startedAt.current = performance.now();
    running.current = true;
    setRemaining(roundMs);
    raf.current = requestAnimationFrame(tick);
  }, [roundMs, tick]);

  const stop = useCallback(() => {
    running.current = false;
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }, []);

  /** Elapsed ms since start, clamped to the round. Read this when the user answers. */
  const elapsed = useCallback(() => {
    if (startedAt.current == null) return 0;
    return Math.min(roundMs, performance.now() - startedAt.current);
  }, [roundMs]);

  useEffect(() => stop, [stop]);

  return { remaining, roundMs, start, stop, elapsed };
}
