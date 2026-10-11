import type { QuestionPack } from "./types";

// ============================================================================
// NAME CATALOG + FUZZY SEARCH
// Powers the "typed" answer mode: every name that appears anywhere in any pack
// (correct answers and curated distractors alike) is a candidate, so the
// player can't narrow it down by knowing which pack they're in.
// ============================================================================

/** Lowercased, accent-stripped alphanumeric words, e.g. "F/A-18 Hornet" → ["f","a","18","hornet"]. */
function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Canonical form for comparing names: punctuation, case and spacing don't matter. */
export function normalizeName(s: string): string {
  return words(s).join("");
}

/** True if two display names refer to the same thing (ids may differ between packs). */
export function sameName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/** Every distinct option/answer label across all packs, deduped by `normalizeName`, sorted A–Z. */
export function buildNameCatalog(packs: QuestionPack[]): string[] {
  const seen = new Map<string, string>();
  const add = (label: string) => {
    const key = normalizeName(label);
    if (key && !seen.has(key)) seen.set(key, label.trim());
  };
  for (const pack of packs) {
    for (const q of pack.questions) {
      q.options?.forEach((o) => add(o.label));
      if (!q.options?.some((o) => o.id === q.answer)) add(q.answer);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** How well one query token matches a name, or null if it doesn't. Higher is better. */
function tokenScore(token: string, nameWords: string[], compact: string): number | null {
  // Exact substring — best when it starts a word ("747" in "Boeing 747-8"),
  // and the compact form lets "f22" match "F-22".
  const at = compact.indexOf(token);
  if (at !== -1) {
    let s = 3;
    if (nameWords.some((w) => w.startsWith(token))) s += 2;
    if (at === 0) s += 1;
    return s;
  }

  // Typo tolerance against word prefixes: "rpator" → "raptor", "sikorksy" → "sikorsky".
  if (token.length >= 4) {
    const allowed = token.length >= 8 ? 2 : 1;
    for (const w of nameWords) {
      if (w.length < token.length - allowed) continue;
      const prefix = w.slice(0, token.length);
      if (editDistance(token, prefix) <= allowed) return 2;
    }
  }

  // In-order subsequence ("blkhwk" → "black hawk"), penalised by how spread out it is.
  let i = 0;
  let first = -1;
  let lastHit = -1;
  for (let j = 0; j < compact.length && i < token.length; j++) {
    if (compact[j] === token[i]) {
      if (first === -1) first = j;
      lastHit = j;
      i++;
    }
  }
  if (i < token.length || token.length < 2) return null;
  const spread = lastHit - first + 1 - token.length;
  return Math.max(0.2, 1.5 - spread * 0.15);
}

/**
 * Ranks `names` against a free-form query. Every query word must match
 * (as a substring, a near-miss typo, or an in-order subsequence).
 */
export function fuzzySearch(query: string, names: readonly string[], limit = 8): string[] {
  const tokens = words(query);
  if (tokens.length === 0) return [];

  const scored: { name: string; score: number }[] = [];
  for (const name of names) {
    const nameWords = words(name);
    const compact = nameWords.join("");
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = tokenScore(t, nameWords, compact);
      if (s === null) {
        ok = false;
        break;
      }
      total += s;
    }
    if (ok) scored.push({ name, score: total / tokens.length });
  }

  scored.sort(
    (a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name),
  );
  return scored.slice(0, limit).map((s) => s.name);
}
