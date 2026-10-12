import { useCallback, useRef, useState } from "react";
import { emptyRecord, markViewed, recordAnswer, type CollectionRecord } from "./collection";
import { loadRecord, saveRecord } from "./collectionStore";

/** The player's collection progress, persisted as it changes. */
export function useCollection() {
  const [record, setRecord] = useState<CollectionRecord>(loadRecord);
  // The latest record, readable synchronously: `answer` must report a new catch
  // straight away, and a catch must be saved before the player can quit.
  const current = useRef(record);

  const commit = useCallback((next: CollectionRecord) => {
    current.current = next;
    saveRecord(next);
    setRecord(next);
  }, []);

  /** Records a finished question and returns whether it was a new catch. */
  const answer = useCallback(
    (key: string, correct: boolean): boolean => {
      const result = recordAnswer(current.current, key, correct);
      commit(result.record);
      return result.newCatch;
    },
    [commit],
  );

  const view = useCallback(
    (key: string) => {
      const next = markViewed(current.current, key);
      if (next !== current.current) commit(next);
    },
    [commit],
  );

  const reset = useCallback(() => commit(emptyRecord()), [commit]);

  return { record, answer, view, reset };
}
