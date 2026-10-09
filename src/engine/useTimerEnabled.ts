import { useCallback, useEffect, useState } from "react";

const KEY = "spot:timerEnabled";

function initial(): boolean {
  const saved = localStorage.getItem(KEY);
  if (saved === "0") return false;
  if (saved === "1") return true;
  return true;
}

/** User-level preference for the round countdown/auto-fail, persisted across sessions. Defaults on. */
export function useTimerEnabled() {
  const [timerEnabled, setTimerEnabled] = useState<boolean>(initial);

  useEffect(() => {
    localStorage.setItem(KEY, timerEnabled ? "1" : "0");
  }, [timerEnabled]);

  const toggle = useCallback(() => setTimerEnabled((v) => !v), []);

  return { timerEnabled, setTimerEnabled, toggle };
}
