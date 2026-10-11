import { useCallback, useEffect, useState } from "react";

/** "choices" = the classic four buttons; "typed" = free-form entry against every name in every pack. */
export type AnswerMode = "choices" | "typed";

const KEY = "spot:answerMode";

function initial(): AnswerMode {
  return localStorage.getItem(KEY) === "typed" ? "typed" : "choices";
}

/** User-level preference for how answers are entered, persisted across sessions. Defaults to choices. */
export function useAnswerMode() {
  const [answerMode, setAnswerMode] = useState<AnswerMode>(initial);

  useEffect(() => {
    localStorage.setItem(KEY, answerMode);
  }, [answerMode]);

  const toggle = useCallback(
    () => setAnswerMode((m) => (m === "choices" ? "typed" : "choices")),
    [],
  );

  return { answerMode, setAnswerMode, toggle };
}
