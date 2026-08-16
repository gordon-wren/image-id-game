import { useEffect, useState } from "react";
import type { QuestionPack, RoundResult } from "./engine/types";
import { loadPack, loadPackIndex } from "./engine/pack";
import { useTheme } from "./engine/useTheme";
import { Picker } from "./components/Picker";
import { Game } from "./components/Game";
import { Summary } from "./components/Summary";

type Screen =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "menu" }
  | { name: "playing"; pack: QuestionPack }
  | { name: "summary"; pack: QuestionPack; results: RoundResult[] };

export default function App() {
  const { theme, toggle } = useTheme();
  const [packs, setPacks] = useState<QuestionPack[]>([]);
  const [screen, setScreen] = useState<Screen>({ name: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const index = await loadPackIndex();
        const loaded = await Promise.all(index.map(loadPack));
        setPacks(loaded);
        setScreen({ name: "menu" });
      } catch (e) {
        setScreen({
          name: "error",
          message: e instanceof Error ? e.message : "Failed to load packs.",
        });
      }
    })();
  }, []);

  return (
    <div className="app">
      <div className="shell">
        <div className="topbar">
          <span className="brand">Spot ·</span>
          <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
            {theme === "light" ? "Dark" : "Light"}
          </button>
        </div>

        {screen.name === "loading" && (
          <div className="state-msg">Loading…</div>
        )}

        {screen.name === "error" && (
          <div className="state-msg">
            Couldn't load the game. {screen.message}
          </div>
        )}

        {screen.name === "menu" && (
          <Picker
            packs={packs}
            onPick={(pack) => setScreen({ name: "playing", pack })}
          />
        )}

        {screen.name === "playing" && (
          <Game
            key={screen.pack.id + Math.random()}
            pack={screen.pack}
            onFinish={(results) =>
              setScreen({ name: "summary", pack: screen.pack, results })
            }
            onQuit={() => setScreen({ name: "menu" })}
          />
        )}

        {screen.name === "summary" && (
          <Summary
            pack={screen.pack}
            results={screen.results}
            onPlayAgain={() => setScreen({ name: "playing", pack: screen.pack })}
            onMenu={() => setScreen({ name: "menu" })}
          />
        )}
      </div>
    </div>
  );
}
