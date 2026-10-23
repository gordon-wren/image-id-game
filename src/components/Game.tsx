import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuestionPack, ResolvedQuestion, RoundResult } from "../engine/types";
import { resolvePack } from "../engine/pack";
import { score } from "../engine/scoring";
import { useTimer } from "../engine/useTimer";
import { sameName } from "../engine/names";
import type { AnswerMode } from "../engine/useAnswerMode";
import { roundSeconds, type TimerSetting } from "../engine/timerSetting";
import { Timer } from "./Timer";
import { AnswerGrid } from "./AnswerGrid";
import { TypedAnswer } from "./TypedAnswer";
import { ResultBanner } from "./ResultBanner";

interface GameProps {
  pack: QuestionPack;
  timer: TimerSetting;
  answerMode: AnswerMode;
  /** Every name across every pack, for typed mode's suggestions. */
  names: readonly string[];
  /**
   * Called as each question finishes, so the collection can record it. Returns the
   * entry number when it's a first catch, to show "New catch!" in the result banner.
   */
  onAnswered?: (answerId: string, correct: boolean) => number | null;
  onFinish: (results: RoundResult[]) => void;
  onQuit: () => void;
}

export function Game({ pack, timer, answerMode, names, onAnswered, onFinish, onQuit }: GameProps) {
  const typed = answerMode === "typed";
  const timerEnabled = timer !== "off";
  const roundMs = roundSeconds(pack, timer, answerMode) * 1000;

  // Resolve the pack once per game so shuffles are stable across re-renders.
  const questions = useMemo<ResolvedQuestion[]>(() => resolvePack(pack), [pack]);

  const [index, setIndex] = useState(0);
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [typedAnswer, setTypedAnswer] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
  /** Entry number when this question was a first catch for the collection. */
  const [newCatch, setNewCatch] = useState<number | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const results = useRef<RoundResult[]>([]);

  const { remaining, start, stop, elapsed } = useTimer(roundMs);
  const q = questions[index];

  // Start / restart the timer whenever we land on a new question.
  useEffect(() => {
    setAnsweredId(null);
    setTypedAnswer(null);
    setLocked(false);
    setRoundResult(null);
    setNewCatch(null);
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
      setNewCatch(onAnswered?.(q.answer, correct) ?? null);
      setTotalScore((s) => s + pts);
      setStreak((s) => (correct ? s + 1 : 0));
    },
    [elapsed, q, roundMs, stop, onAnswered]
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

  const correctLabel =
    q.resolvedOptions.find((o) => o.id === q.answer)?.label ?? q.answer;

  // Typed answers are matched by name, since the same object can have different ids across packs.
  const submitTyped = (name: string) => {
    if (locked) return;
    setTypedAnswer(name);
    finalizeRound(sameName(name, correctLabel) ? q.answer : null, false);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      onFinish(results.current);
    } else {
      setIndex((i) => i + 1);
    }
  };

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

      {typed ? (
        <TypedAnswer
          key={q.id}
          names={names}
          correctLabel={correctLabel}
          answered={typedAnswer}
          locked={locked}
          onSubmit={submitTyped}
        />
      ) : (
        <AnswerGrid
          options={q.resolvedOptions}
          answeredId={answeredId}
          correctId={q.answer}
          locked={locked}
          onChoose={choose}
        />
      )}

      {roundResult && (
        <>
          <ResultBanner
            result={roundResult}
            correctLabel={correctLabel}
            caption={q.caption}
            natoName={q.natoName}
            credit={q.credit}
            newCatch={newCatch}
          />
          <button className="next-btn" onClick={next} autoFocus>
            {index + 1 >= questions.length ? "See results" : "Next"}
          </button>
        </>
      )}
    </div>
  );
}
