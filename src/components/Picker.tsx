import type { QuestionPack } from "../engine/types";
import { getHighScore } from "../engine/highScores";

interface PickerProps {
  title: string;
  packs: QuestionPack[];
  onPick: (pack: QuestionPack) => void;
  onStudy: (pack: QuestionPack) => void;
  onBack: () => void;
}

export function Picker({ title, packs, onPick, onStudy, onBack }: PickerProps) {
  return (
    <div className="panel">
      <div className="picker-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to categories">
          ← Back
        </button>
        <p className="picker-title">{title}</p>
      </div>
      {packs.map((pack) => {
        const hs = getHighScore(pack.id);
        const accentStyle = { ["--accent" as string]: pack.theme.accent };
        return (
          <div key={pack.id} className="pack-row">
            <button
              className="pack-card"
              style={accentStyle}
              onClick={() => onPick(pack)}
            >
              <div className="pack-card-row">
                <p className="pack-title">{pack.title}</p>
                {hs !== null && (
                  <span className="pack-hs">★ {hs.toLocaleString()}</span>
                )}
              </div>
              {pack.description && <p className="pack-desc">{pack.description}</p>}
            </button>
            <button
              className="study-btn"
              style={accentStyle}
              onClick={() => onStudy(pack)}
              aria-label={`Study ${pack.title} with flashcards`}
            >
              Study
            </button>
          </div>
        );
      })}
    </div>
  );
}
