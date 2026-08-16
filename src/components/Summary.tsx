import type { QuestionPack, RoundResult } from "../engine/types";

interface SummaryProps {
  pack: QuestionPack;
  results: RoundResult[];
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function Summary({ pack, results, onPlayAgain, onMenu }: SummaryProps) {
  const total = results.reduce((s, r) => s + r.points, 0);
  const correct = results.filter((r) => r.correct).length;

  return (
    <div className="stage" style={{ ["--accent" as string]: pack.theme.accent }}>
      <div className="summary">
        <div className="summary-score">{total.toLocaleString()}</div>
        <div className="summary-label">
          {correct} of {results.length} correct
        </div>
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
