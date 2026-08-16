import type { QuestionPack } from "../engine/types";

interface PickerProps {
  packs: QuestionPack[];
  onPick: (pack: QuestionPack) => void;
}

export function Picker({ packs, onPick }: PickerProps) {
  return (
    <div className="panel">
      {packs.map((pack) => (
        <button
          key={pack.id}
          className="pack-card"
          style={{ ["--accent" as string]: pack.theme.accent }}
          onClick={() => onPick(pack)}
        >
          <p className="pack-title">{pack.title}</p>
          {pack.description && <p className="pack-desc">{pack.description}</p>}
        </button>
      ))}
    </div>
  );
}
