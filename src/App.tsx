import { useEffect, useMemo, useState } from "react";
import type { QuestionPack, RoundResult } from "./engine/types";
import { loadPack, loadPackIndex } from "./engine/pack";
import { buildCategoryTree, packPathIds } from "./engine/categories";
import { useTheme } from "./engine/useTheme";
import { useTimerSetting } from "./engine/useTimerSetting";
import { useAnswerMode } from "./engine/useAnswerMode";
import { buildNameCatalog } from "./engine/names";
import { ColumnBrowser, type BrowserSelection } from "./components/ColumnBrowser";
import { Game } from "./components/Game";
import { Summary } from "./components/Summary";
import { TimerPicker } from "./components/TimerPicker";

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "browse"; selection: BrowserSelection }
  | { name: "playing"; pack: QuestionPack }
  | { name: "summary"; pack: QuestionPack; results: RoundResult[] };

export default function App() {
  const { theme, toggle } = useTheme();
  const { timer, setTimer } = useTimerSetting();
  const { answerMode, toggle: toggleAnswerMode } = useAnswerMode();
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  const tree = useMemo(() => buildCategoryTree(packs), [packs]);
  const names = useMemo(() => buildNameCatalog(packs), [packs]);

  useEffect(() => {
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

  // Return to the browser with the pack still selected, so "back" lands where you left off.
  const browseScreen = (pack: QuestionPack): Screen => ({
    name: "browse",
    selection: { path: packPathIds(pack), packId: pack.id },
  });

  return (
    <div className="app">
      <div className={`shell${screen.name === "browse" ? " wide" : ""}`}>
        <div className="topbar">
          {screen.name === "playing" ? (
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
            {screen.name === "browse" && (
              <button
                className="icon-btn"
                onClick={toggleAnswerMode}
                aria-label="Toggle answer mode"
              >
                Answer: {answerMode === "typed" ? "Typed" : "Choices"}
              </button>
            )}
            {screen.name === "browse" && <TimerPicker value={timer} onChange={setTimer} />}
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
            onPlay={(pack) => setScreen({ name: "playing", pack })}
            timer={timer}
            answerMode={answerMode}
          />
        )}

        {screen.name === "playing" && (
          <Game
            key={screen.pack.id + Math.random()}
            pack={screen.pack}
            timer={timer}
            answerMode={answerMode}
            names={names}
            onFinish={(results) =>
              setScreen({ name: "summary", pack: screen.pack, results })
            }
            onQuit={() => setScreen(browseScreen(screen.pack))}
          />
        )}

        {screen.name === "summary" && (
          <Summary
            pack={screen.pack}
            results={screen.results}
            onPlayAgain={() => setScreen({ name: "playing", pack: screen.pack })}
            onMenu={() => setScreen(browseScreen(screen.pack))}
          />
        )}
      </div>
    </div>
  );
}
