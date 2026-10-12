import { emptyRecord, parseRecord, type CollectionRecord } from "./collection";

// The only place the collection touches storage. Swap these two functions for a
// sync backend later; nothing else needs to change.

const KEY = "spot:collection";

/** The saved record, or an empty one if there's none or storage is unavailable (private browsing). */
export function loadRecord(): CollectionRecord {
  try {
    return parseRecord(localStorage.getItem(KEY));
  } catch {
    return emptyRecord();
  }
}

/** Saves the record. Without storage the game still works; progress just isn't kept. */
export function saveRecord(record: CollectionRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage full or blocked: keep playing without persisting.
  }
}
