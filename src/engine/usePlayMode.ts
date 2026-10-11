import { useCallback, useEffect, useState } from "react";

/** "play" = the timed, scored game; "study" = untimed flashcards. */
export type PlayMode = "play" | "study";

const KEY = "spot:playMode";

function initial(): PlayMode {
  return localStorage.getItem(KEY) === "study" ? "study" : "play";
}

/** User-level choice of what opening a pack does, persisted across sessions. Defaults to play. */
export function usePlayMode() {
  const [playMode, setPlayMode] = useState<PlayMode>(initial);

  useEffect(() => {
    localStorage.setItem(KEY, playMode);
  }, [playMode]);

  const toggle = useCallback(
    () => setPlayMode((m) => (m === "play" ? "study" : "play")),
    [],
  );

  return { playMode, setPlayMode, toggle };
}
