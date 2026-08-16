import type { Option } from "../engine/types";

interface AnswerGridProps {
  options: Option[];
  /** Set once the player has answered (or time ran out). */
  answeredId: string | null;
  correctId: string;
  locked: boolean;
  onChoose: (id: string) => void;
}

export function AnswerGrid({
  options,
  answeredId,
  correctId,
  locked,
  onChoose,
}: AnswerGridProps) {
  return (
    <div className="answers">
      {options.map((opt) => {
        let cls = "answer";
        if (locked) {
          if (opt.id === correctId) cls += " correct";
          else if (opt.id === answeredId) cls += " wrong";
        }
        return (
          <button
            key={opt.id}
            className={cls}
            disabled={locked}
            onClick={() => onChoose(opt.id)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
