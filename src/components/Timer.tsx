interface TimerProps {
  remaining: number;
  roundMs: number;
}

/** Draining bar whose color encodes urgency (and, implicitly, the speed bonus). */
export function Timer({ remaining, roundMs }: TimerProps) {
  const frac = roundMs > 0 ? remaining / roundMs : 0;
  const seconds = (remaining / 1000).toFixed(1);

  let color = "var(--timer-good)";
  if (frac <= 0.25) color = "var(--timer-danger)";
  else if (frac <= 0.6) color = "var(--timer-warn)";

  return (
    <div className="timer">
      <div className="timer-track" role="timer" aria-label={`${seconds} seconds remaining`}>
        <div
          className="timer-fill"
          style={{ width: `${frac * 100}%`, background: color }}
        />
      </div>
      <span className="timer-num">{seconds}s</span>
    </div>
  );
}
