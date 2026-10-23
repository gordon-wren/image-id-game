import type { RoundResult } from "../engine/types";
import { formatNumber } from "../engine/collection";
import { NatoName } from "./NatoName";

interface ResultBannerProps {
  result: RoundResult;
  correctLabel: string;
  caption?: string;
  natoName?: string;
  credit?: string;
  /** Collection entry number when this answer was a first catch. */
  newCatch?: number | null;
}

export function ResultBanner({ result, correctLabel, caption, natoName, credit, newCatch }: ResultBannerProps) {
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
      <div className="result-text">
        {text}
        {newCatch != null && <span className="catch-badge">New catch! {formatNumber(newCatch)}</span>}
      </div>
      {natoName && <NatoName name={natoName} />}
      {caption && <div className="result-credit">{caption}</div>}
      {credit && <div className="result-credit">{credit}</div>}
    </div>
  );
}
