import { useEffect } from "react";
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (locked) return;
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i !== -1 && options[i]) onChoose(options[i].id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [locked, options, onChoose]);

  return (
    <div className="answers">
      {options.map((opt, i) => {
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
            <span className="answer-key">{i + 1}</span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
