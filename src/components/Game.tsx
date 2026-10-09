import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuestionPack, ResolvedQuestion, RoundResult } from "../engine/types";
import { resolvePack, DEFAULTS } from "../engine/pack";
import { score } from "../engine/scoring";
import { useTimer } from "../engine/useTimer";
import { Timer } from "./Timer";
import { AnswerGrid } from "./AnswerGrid";
import { ResultBanner } from "./ResultBanner";

interface GameProps {
  pack: QuestionPack;
  timerEnabled: boolean;
  onFinish: (results: RoundResult[]) => void;
  onQuit: () => void;
}

export function Game({ pack, timerEnabled, onFinish, onQuit }: GameProps) {
  const roundMs = (pack.roundSeconds ?? DEFAULTS.roundSeconds) * 1000;

  // Resolve the pack once per game so shuffles are stable across re-renders.
  const questions = useMemo<ResolvedQuestion[]>(() => resolvePack(pack), [pack]);

  const [index, setIndex] = useState(0);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const results = useRef<RoundResult[]>([]);

  const { remaining, start, stop, elapsed } = useTimer(roundMs);
  const q = questions[index];

  // Start / restart the timer whenever we land on a new question.
  useEffect(() => {
    setAnsweredId(null);
    setLocked(false);
    setRoundResult(null);
    start();
    return stop;
  }, [index, start, stop]);

  const finalizeRound = useCallback(
    (chosenId: string | null, timedOut: boolean) => {
      stop();
      setLocked(true);
      const ms = elapsed();
      const correct = chosenId === q.answer;
      const pts = score(correct, ms, roundMs);
      const r: RoundResult = {
        questionId: q.id,
        correct,
        msElapsed: ms,
        points: pts,
        timedOut,
      };
      results.current.push(r);
      setRoundResult(r);
      setTotalScore((s) => s + pts);
      setStreak((s) => (correct ? s + 1 : 0));
    },
    [elapsed, q, roundMs, stop]
  );

  useEffect(() => {
    if (!timerEnabled) return;
    if (remaining <= 0 && !locked) finalizeRound(null, true);
  }, [timerEnabled, remaining, locked, finalizeRound]);

  const choose = (id: string) => {
    if (locked) return;
    setAnsweredId(id);
    finalizeRound(id, false);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      onFinish(results.current);
    } else {
      setIndex((i) => i + 1);
    }
  };

  const correctLabel =
    q.resolvedOptions.find((o) => o.id === q.answer)?.label ?? q.answer;

  return (
    <div className="stage" style={{ ["--accent" as string]: pack.theme.accent }}>
      <div className="stage-head">
        <div className="mode">
          <span className="mode-dot" />
          <span>{pack.title}</span>
        </div>
        <div className="meta">
          <button className="icon-btn" onClick={onQuit} aria-label="Quit to menu">
            Quit
          </button>
          <span className="muted">
            {index + 1} / {questions.length}
          </span>
          {streak >= 2 && (
            <span className="streak" aria-label={`${streak} in a row`}>
              🔥 {streak}
            </span>
          )}
          <span>
            ★ <span className="score-val">{totalScore.toLocaleString()}</span>
          </span>
        </div>
      </div>

      {timerEnabled && <Timer remaining={remaining} roundMs={roundMs} />}

      <div className="hero">
        <img
          src={q.resolvedImage}
          alt={locked ? correctLabel : q.alt ?? "Identify this image"}
        />
      </div>

      <AnswerGrid
        options={q.resolvedOptions}
        answeredId={answeredId}
        correctId={q.answer}
        locked={locked}
        onChoose={choose}
      />

      {roundResult && (
        <>
          <ResultBanner
            result={roundResult}
            correctLabel={correctLabel}
            caption={q.caption}
            credit={q.credit}
          />
          <button className="next-btn" onClick={next} autoFocus>
            {index + 1 >= questions.length ? "See results" : "Next"}
          </button>
        </>
      )}
    </div>
  );
}
