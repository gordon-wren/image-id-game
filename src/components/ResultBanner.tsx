import type { RoundResult } from "../engine/types";

interface ResultBannerProps {
  result: RoundResult;
  correctLabel: string;
  caption?: string;
  credit?: string;
}

export function ResultBanner({ result, correctLabel, caption, credit }: ResultBannerProps) {
  const { correct, timedOut, points, msElapsed } = result;

  let cls = "result ";
  let text: string;

  if (timedOut) {
    cls += "neutral";
    text = `Time's up — it was ${correctLabel}`;
  } else if (correct) {
    cls += "good";
    const fast = msElapsed < 2500;
    text = `+${points.toLocaleString()}  ${fast ? "— fast!" : "— nice"}`;
  } else {
    cls += "bad";
    text = `Missed — it was ${correctLabel}`;
  }

  return (
    <div className={cls} role="status">
      <div className="result-text">{text}</div>
      {caption && <div className="result-credit">{caption}</div>}
      {credit && <div className="result-credit">{credit}</div>}
    </div>
  );
}
