import { useEffect, useState } from "react";
import { parseTimerSetting, type TimerSetting } from "./timerSetting";

const KEY = "spot:timer";
/** The old on/off toggle's key; read once so "off" survives the upgrade. */
const LEGACY_KEY = "spot:timerEnabled";

function initial(): TimerSetting {
  const saved = localStorage.getItem(KEY);
  if (saved !== null) return parseTimerSetting(saved);
  return localStorage.getItem(LEGACY_KEY) === "0" ? "off" : "pack";
}

/** User-level round timer preference, persisted across sessions. Defaults to the pack's own time. */
export function useTimerSetting() {
  const [timer, setTimer] = useState<TimerSetting>(initial);

  useEffect(() => {
    localStorage.setItem(KEY, String(timer));
    localStorage.removeItem(LEGACY_KEY);
  }, [timer]);

  return { timer, setTimer };
}
