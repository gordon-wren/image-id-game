import { useEffect, useMemo, useRef, useState } from "react";
import type { QuestionPack, RoundResult } from "./engine/types";
import { loadPack, loadPackIndex } from "./engine/pack";
import { buildCategoryTree, packPathIds } from "./engine/categories";
import { useTheme } from "./engine/useTheme";
import { useTimerSetting } from "./engine/useTimerSetting";
import { useAnswerMode } from "./engine/useAnswerMode";
import { usePlayMode } from "./engine/usePlayMode";
import { buildNameCatalog } from "./engine/names";
import { entryKey, loadCatalog, type Catalog } from "./engine/collection";
import { useCollection } from "./engine/useCollection";
import { ColumnBrowser, type BrowserSelection } from "./components/ColumnBrowser";
import { Game } from "./components/Game";
import { Summary } from "./components/Summary";
import { Study } from "./components/Study";
import { TimerPicker } from "./components/TimerPicker";
import { Collection } from "./components/Collection";

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "browse"; selection: BrowserSelection }
  | { name: "playing"; pack: QuestionPack; run: number }
  | { name: "studying"; pack: QuestionPack; run: number }
  | { name: "summary"; pack: QuestionPack; results: RoundResult[]; catches: string[]; run: number }
  | { name: "collection"; back: Screen };

export default function App() {
  const { theme, toggle } = useTheme();
  const { timer, setTimer } = useTimerSetting();
  const { answerMode, toggle: toggleAnswerMode } = useAnswerMode();
  const { playMode, toggle: togglePlayMode } = usePlayMode();
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const collection = useCollection();
  /** Entries first caught during the current round, for the summary. */
  const roundCatches = useRef<string[]>([]);

  const tree = useMemo(() => buildCategoryTree(packs), [packs]);
  const names = useMemo(() => buildNameCatalog(packs), [packs]);

  useEffect(() => {
    // The collection is an extra: if its catalog fails to load, the game still plays.
    loadCatalog().then(setCatalog, () => setCatalog(null));
    (async () => {
      try {
        const index = await loadPackIndex();
        const loaded = await Promise.all(index.map(loadPack));
        setPacks(loaded);
        setScreen({ name: "browse", selection: { path: [] } });
      } catch (e) {
        setScreen({
          name: "error",
          message: e instanceof Error ? e.message : "Failed to load packs.",
        });
      }
    })();
  }, []);

  const play = (pack: QuestionPack, run = 0): Screen => {
    roundCatches.current = [];
    return { name: "playing", pack, run };
  };

  /** Records a finished question in the collection; returns the entry number if it was a new catch. */
  const recordAnswer = (pack: QuestionPack, answerId: string, correct: boolean): number | null => {
    const key = catalog && entryKey(catalog, pack.id, answerId);
    if (!catalog || !key) return null;
    if (!collection.answer(key, correct)) return null;
    roundCatches.current.push(key);
    return catalog.entries[key].number;
  };

  // Return to the browser with the pack still selected, so "back" lands where you left off.
  const browseScreen = (pack: QuestionPack): Screen => ({
    name: "browse",
    selection: { path: packPathIds(pack), packId: pack.id },
  });

  return (
    <div className="app">
      <div className={`shell${screen.name === "browse" || screen.name === "collection" ? " wide" : ""}`}>
        <div className="topbar">
          {screen.name === "playing" || screen.name === "studying" || screen.name === "collection" ? (
            <button
              className="brand brand-link"
              onClick={() => setScreen({ name: "browse", selection: { path: [] } })}
              aria-label="Exit to menu"
            >
              Spot ·
            </button>
          ) : (
            <span className="brand">Spot ·</span>
          )}
          <div className="topbar-actions">
            {screen.name === "browse" && catalog && (
              <button className="icon-btn" onClick={() => setScreen({ name: "collection", back: screen })}>
                Collection
              </button>
            )}
            {screen.name === "browse" && (
              <button
                className="icon-btn"
                onClick={togglePlayMode}
                aria-label="Toggle between playing and studying with flashcards"
              >
                Mode: {playMode === "study" ? "Study" : "Play"}
              </button>
            )}
            {screen.name === "browse" && playMode === "play" && (
              <button
                className="icon-btn"
                onClick={toggleAnswerMode}
                aria-label="Toggle answer mode"
              >
                Answer: {answerMode === "typed" ? "Typed" : "Choices"}
              </button>
            )}
            {screen.name === "browse" && playMode === "play" && (
              <TimerPicker value={timer} onChange={setTimer} />
            )}
            <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
              {theme === "light" ? "Dark" : "Light"}
            </button>
          </div>
        </div>

        {screen.name === "loading" && (
          <div className="state-msg">Loading…</div>
        )}

        {screen.name === "error" && (
          <div className="state-msg">
            Couldn't load the game. {screen.message}
          </div>
        )}

        {screen.name === "browse" && (
          <ColumnBrowser
            root={tree}
            selection={screen.selection}
            onSelect={(selection) => setScreen({ name: "browse", selection })}
            mode={playMode}
            onStart={(pack) =>
              setScreen(
                playMode === "study"
                  ? { name: "studying", pack, run: 0 }
                  : play(pack),
              )
            }
            timer={timer}
            answerMode={answerMode}
          />
        )}

        {screen.name === "playing" && (
          <Game
            key={`${screen.pack.id}-${screen.run}`}
            pack={screen.pack}
            timer={timer}
            answerMode={answerMode}
            names={names}
            onAnswered={(answerId, correct) => recordAnswer(screen.pack, answerId, correct)}
            onFinish={(results) =>
              setScreen({
                name: "summary",
                pack: screen.pack,
                results,
                catches: roundCatches.current,
                run: screen.run,
              })
            }
            onQuit={() => setScreen(browseScreen(screen.pack))}
          />
        )}

        {screen.name === "studying" && (
          <Study
            key={`${screen.pack.id}-${screen.run}`}
            pack={screen.pack}
            onRestart={() =>
              setScreen({ name: "studying", pack: screen.pack, run: screen.run + 1 })
            }
            onQuit={() => setScreen(browseScreen(screen.pack))}
          />
        )}

        {screen.name === "summary" && (
          <Summary
            pack={screen.pack}
            results={screen.results}
            newCatches={catalog ? screen.catches.map((key) => catalog.entries[key]) : []}
            onPlayAgain={() => setScreen(play(screen.pack, screen.run + 1))}
            onCollection={catalog ? () => setScreen({ name: "collection", back: screen }) : undefined}
            onMenu={() => setScreen(browseScreen(screen.pack))}
          />
        )}

        {screen.name === "collection" && catalog && (
          <>
            <button className="back-link" onClick={() => setScreen(screen.back)}>
              ← Back
            </button>
            <Collection
              catalog={catalog}
              record={collection.record}
              packs={packs}
              onView={collection.view}
              onReset={collection.reset}
            />
          </>
        )}
      </div>
    </div>
  );
}
