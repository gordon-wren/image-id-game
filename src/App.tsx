import { useEffect, useMemo, useState } from "react";
import type { QuestionPack, RoundResult } from "./engine/types";
import { loadPack, loadPackIndex } from "./engine/pack";
import { groupPacksByCategory, categoryIdForPack } from "./engine/categories";
import { useTheme } from "./engine/useTheme";
import { useTimerEnabled } from "./engine/useTimerEnabled";
import { CategoryPicker } from "./components/CategoryPicker";
import { Picker } from "./components/Picker";
import { Game } from "./components/Game";
import { Summary } from "./components/Summary";
import { Study } from "./components/Study";

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "categories" }
  | { name: "packs"; categoryId: string }
  | { name: "playing"; pack: QuestionPack }
  | { name: "studying"; pack: QuestionPack; run: number }
  | { name: "summary"; pack: QuestionPack; results: RoundResult[] };

export default function App() {
  const { theme, toggle } = useTheme();
  const { timerEnabled, toggle: toggleTimer } = useTimerEnabled();
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  const categories = useMemo(() => groupPacksByCategory(packs), [packs]);

  useEffect(() => {
    (async () => {
      try {
        const index = await loadPackIndex();
        const loaded = await Promise.all(index.map(loadPack));
        setPacks(loaded);
        setScreen({ name: "categories" });
      } catch (e) {
        setScreen({
          name: "error",
          message: e instanceof Error ? e.message : "Failed to load packs.",
        });
      }
    })();
  }, []);

  const packsScreen = (pack: QuestionPack): Screen => ({
    name: "packs",
    categoryId: categoryIdForPack(pack),
  });

  return (
    <div className="app">
      <div className="shell">
        <div className="topbar">
          {screen.name === "playing" || screen.name === "studying" || screen.name === "packs" ? (
            <button
              className="brand brand-link"
              onClick={() => setScreen({ name: "categories" })}
              aria-label="Exit to menu"
            >
              Spot ·
            </button>
          ) : (
            <span className="brand">Spot ·</span>
          )}
          <div className="topbar-actions">
            {(screen.name === "categories" || screen.name === "packs") && (
              <button
                className="icon-btn"
                onClick={toggleTimer}
                aria-pressed={timerEnabled}
                aria-label="Toggle round timer"
              >
                Timer: {timerEnabled ? "On" : "Off"}
              </button>
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

        {screen.name === "categories" && (
          <CategoryPicker
            categories={categories}
            onPick={(category) =>
              setScreen({ name: "packs", categoryId: category.id })
            }
          />
        )}

        {screen.name === "packs" && (
          <Picker
            title={
              categories.find((c) => c.id === screen.categoryId)?.title ?? ""
            }
            packs={
              categories.find((c) => c.id === screen.categoryId)?.packs ?? []
            }
            onPick={(pack) => setScreen({ name: "playing", pack })}
            onStudy={(pack) => setScreen({ name: "studying", pack, run: 0 })}
            onBack={() => setScreen({ name: "categories" })}
          />
        )}

        {screen.name === "playing" && (
          <Game
            key={screen.pack.id + Math.random()}
            pack={screen.pack}
            timerEnabled={timerEnabled}
            onFinish={(results) =>
              setScreen({ name: "summary", pack: screen.pack, results })
            }
            onQuit={() => setScreen(packsScreen(screen.pack))}
          />
        )}

        {screen.name === "studying" && (
          <Study
            key={`${screen.pack.id}-${screen.run}`}
            pack={screen.pack}
            onRestart={() =>
              setScreen({ name: "studying", pack: screen.pack, run: screen.run + 1 })
            }
            onQuit={() => setScreen(packsScreen(screen.pack))}
          />
        )}

        {screen.name === "summary" && (
          <Summary
            pack={screen.pack}
            results={screen.results}
            onPlayAgain={() => setScreen({ name: "playing", pack: screen.pack })}
            onMenu={() => setScreen(packsScreen(screen.pack))}
          />
        )}
      </div>
    </div>
  );
}
