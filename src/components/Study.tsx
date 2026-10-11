import { useEffect, useMemo, useState } from "react";
import type { QuestionPack } from "../engine/types";
import {
  buildDeck,
  currentCard,
  firstTryCount,
  flip,
  isComplete,
  mark,
  startSession,
} from "../engine/flashcards";

interface StudyProps {
  pack: QuestionPack;
  onRestart: () => void;
  onQuit: () => void;
}

export function Study({ pack, onRestart, onQuit }: StudyProps) {
  // Build the deck once per session so the shuffle is stable across re-renders.
  const deck = useMemo(() => buildDeck(pack), [pack]);
  const [session, setSession] = useState(() => startSession(deck));
  const card = currentCard(session);
  const done = isComplete(session);
  const upNext = session.queue[1];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (done) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setSession(flip);
      } else if (session.flipped && (e.key === "ArrowLeft" || e.key === "1")) {
        setSession((s) => mark(s, false));
      } else if (session.flipped && (e.key === "ArrowRight" || e.key === "2")) {
        setSession((s) => mark(s, true));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [done, session.flipped]);

  const accentStyle = { ["--accent" as string]: pack.theme.accent };

  if (done || !card) {
    const firstTry = firstTryCount(session);
    return (
      <div className="stage" style={accentStyle}>
        <div className="summary">
          <div className="summary-score">
            {firstTry} / {session.total}
          </div>
          <div className="summary-label">
            known on the first try · all {session.total} cards learned
          </div>
          <button className="next-btn" onClick={onRestart} autoFocus>
            Study again
          </button>
          <button
            className="icon-btn"
            onClick={onQuit}
            style={{ marginTop: 10, width: "100%", padding: 12 }}
          >
            Back to menu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stage" style={accentStyle}>
      <div className="stage-head">
        <div className="mode">
          <span className="mode-dot" />
          <span>{pack.title} · Study</span>
        </div>
        <div className="meta">
          <button className="icon-btn" onClick={onQuit} aria-label="Quit to menu">
            Quit
          </button>
          <span className="muted">
            {session.known.length} / {session.total} learned
          </span>
        </div>
      </div>

      <div className="timer-track study-progress" aria-hidden="true">
        <div
          className="timer-fill"
          style={{
            width: `${(session.known.length / session.total) * 100}%`,
            background: "var(--accent)",
          }}
        />
      </div>

      <button
        key={card.id + session.queue.length}
        className={`flashcard${session.flipped ? " flipped" : ""}`}
        onClick={() => setSession(flip)}
        aria-label={session.flipped ? `Answer: ${card.label}. Tap to flip back` : "Tap to reveal the answer"}
      >
        <div className="flashcard-inner">
          <div className="flashcard-face flashcard-front">
            <img src={card.resolvedImage} alt={card.alt ?? "Identify this aircraft"} />
          </div>
          <div className="flashcard-face flashcard-back" aria-live="polite">
            <p className="flashcard-label">{session.flipped ? card.label : ""}</p>
            {session.flipped && card.caption && (
              <p className="result-credit">{card.caption}</p>
            )}
            {session.flipped && card.credit && (
              <p className="result-credit">{card.credit}</p>
            )}
          </div>
        </div>
      </button>

      {session.flipped ? (
        <div className="answers study-actions">
          <button className="answer answer-learning" onClick={() => setSession((s) => mark(s, false))}>
            <span className="answer-key">1</span>
            Still learning
          </button>
          <button className="answer answer-known" onClick={() => setSession((s) => mark(s, true))}>
            <span className="answer-key">2</span>
            Got it
          </button>
        </div>
      ) : (
        <p className="study-hint">Tap the card or press Space to flip</p>
      )}

      {/* Preload the next image so the flip to the next card is instant. */}
      {upNext && <link rel="preload" as="image" href={upNext.resolvedImage} />}
    </div>
  );
}
