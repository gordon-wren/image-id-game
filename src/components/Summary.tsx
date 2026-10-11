import { useEffect } from "react";
import type { QuestionPack, RoundResult } from "../engine/types";
import { setHighScore } from "../engine/highScores";
import { formatNumber, type CatalogEntry } from "../engine/collection";

interface SummaryProps {
  pack: QuestionPack;
  results: RoundResult[];
  /** Collection entries caught for the first time this round. */
  newCatches: CatalogEntry[];
  onPlayAgain: () => void;
  /** Opens the collection; the link is hidden without it. */
  onCollection?: () => void;
  onMenu: () => void;
}

export function Summary({ pack, results, newCatches, onPlayAgain, onCollection, onMenu }: SummaryProps) {
  const total = results.reduce((s, r) => s + r.points, 0);
  const correct = results.filter((r) => r.correct).length;

  useEffect(() => {
    setHighScore(pack.id, total);
  }, [pack.id, total]);

  return (
    <div className="stage" style={{ ["--accent" as string]: pack.theme.accent }}>
      <div className="summary">
        <div className="summary-score">{total.toLocaleString()}</div>
        <div className="summary-label">
          {correct} of {results.length} correct
        </div>
        {newCatches.length > 0 && (
          <div className="summary-catches">
            <p className="summary-catches-title">
              {newCatches.length === 1 ? "1 new catch" : `${newCatches.length} new catches`}
            </p>
            <ul>
              {newCatches.map((e) => (
                <li key={e.number}>
                  <span className="catch-number">{formatNumber(e.number)}</span> {e.name}
                </li>
              ))}
            </ul>
            {onCollection && (
              <button className="icon-btn summary-catches-link" onClick={onCollection}>
                View collection
              </button>
            )}
          </div>
        )}
        <button className="next-btn" onClick={onPlayAgain} autoFocus>
          Play again
        </button>
        <button
          className="icon-btn"
          onClick={onMenu}
          style={{ marginTop: 10, width: "100%", padding: 12 }}
        >
          Back to menu
        </button>
      </div>
    </div>
  );
}
