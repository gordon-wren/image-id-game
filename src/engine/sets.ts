import type { Question } from "./types.ts";

// ============================================================================
// SET BUILDING
// Turns a set of aircraft into quiz questions, each with three similar wrong
// answers drawn from the same set. Shared by the pack generator
// (scripts/packs/generate.mjs, which imports this file directly; Node strips
// the types) and the Explore view, which builds sets when you click.
// Keep it to type-only TypeScript (no enums or parameter properties) so Node
// can run it, and keep its imports type-only.
// ============================================================================

/** The aircraft fields a set needs. A full dataset record satisfies it. */
export interface SetAircraft {
  id: string;
  label: string;
  group: string;
  countryOfOrigin: string[];
  firstFlight: string | number | null;
  manufacturer: string[];
  description: string | null;
  /** NATO reporting name, e.g. "Badger"; only some military aircraft have one. */
  natoName?: string | null;
  photo: { file: string | null; credit: string } | null;
}

export const ASSET_BASE = "assets/aircraft/";
/** 240 × 240 thumbnails of the same photos, made by `npm run thumbs` (Explore's mosaic). */
export const THUMB_BASE = "assets/aircraft-thumbs/";
const DISTRACTORS = 3;
/** Distractors are drawn at random from this many of the most similar aircraft. */
const SHORTLIST = 8;

/** FNV-1a, for seeding the RNG from a question id. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * mulberry32: a small seeded RNG returning floats in [0, 1). Wrong answers are
 * seeded by question id so the same set always gets the same options; the
 * random choice of which questions to ask uses crypto (see random.ts).
 */
export function rngFor(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const firstFlightYear = (a: SetAircraft) => (a.firstFlight ? Number(String(a.firstFlight).slice(0, 4)) : null);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * True when one label is the other plus a suffix ("Boeing 747" / "Boeing 747-8",
 * "Airbus A330" / "Airbus A330neo"). A photo of one is arguably also the other,
 * so they never appear as each other's wrong answer.
 */
export function overlaps(a: SetAircraft, b: SetAircraft): boolean {
  const x = norm(a.label), y = norm(b.label);
  return x.startsWith(y) || y.startsWith(x);
}

/** Folds historical names together so a Soviet design counts as related to its Russian successor. */
function countryKey(c: string): string {
  const k = c.toLowerCase();
  if (/soviet|russia/.test(k)) return "russia";
  if (/german/.test(k)) return "germany";
  if (/japan/.test(k)) return "japan";
  if (/china/.test(k)) return "china";
  return k;
}

/** How alike two aircraft are, for picking convincing wrong answers. */
export function similarity(a: SetAircraft, b: SetAircraft): number {
  let s = 0;
  if (a.group === b.group) s += 4;
  const countries = new Set(b.countryOfOrigin.map(countryKey));
  if (a.countryOfOrigin.some((c) => countries.has(countryKey(c)))) s += 2;
  const ya = firstFlightYear(a), yb = firstFlightYear(b);
  if (ya != null && yb != null) {
    const gap = Math.abs(ya - yb);
    if (gap <= 10) s += 2;
    else if (gap <= 25) s += 1;
  }
  if (a.manufacturer.some((m) => b.manufacturer.includes(m))) s += 2;
  return s;
}

/**
 * Wrong answers for `answer`: always the most similar aircraft in `pool`, then
 * a random draw from the next most similar, so questions vary between sets.
 */
export function pickDistractors<T extends SetAircraft>(answer: T, pool: readonly T[], seed: string, count = DISTRACTORS): T[] {
  const rng = rngFor(seed);
  // Each pair gets its own tie-break, so adding an aircraft to the dataset only
  // changes the questions it actually ranks for, not every set.
  const ranked = pool
    .filter((c) => c.id !== answer.id && !overlaps(c, answer))
    .map((c) => ({ c, score: similarity(answer, c), tie: rngFor(`${seed}|${c.id}`)() }))
    .sort((x, y) => y.score - x.score || x.tie - y.tie);
  // Weak matches only make the shortlist when there aren't enough strong ones.
  const floor = (ranked[0]?.score ?? 0) / 2;
  const strong = ranked.filter((r, i) => i < count || r.score >= floor);
  const shortlist = strong.slice(0, Math.max(SHORTLIST, count)).map((r) => r.c);
  const picked = shortlist.splice(0, Math.min(1, count));
  while (picked.length < count && shortlist.length) {
    picked.push(shortlist.splice(Math.floor(rng() * shortlist.length), 1)[0]);
  }
  return picked;
}

function caption(a: SetAircraft): string {
  const y = firstFlightYear(a);
  const desc = a.description ? a.description[0].toUpperCase() + a.description.slice(1) : null;
  return [desc, y ? `First flew ${y}` : null].filter(Boolean).join(". ") + ".";
}

/**
 * One question per member, ids prefixed with `setId`. Wrong answers come from
 * the set itself, so a Soviet set only offers Soviet aircraft; only if the set
 * can't supply three (after leaving out the answer's own variants) are the
 * rest drawn from `everyone`.
 */
export function buildQuestions<T extends SetAircraft>(setId: string, members: readonly T[], everyone: readonly T[]): Question[] {
  return members.map((a) => {
    const id = `${setId}-${a.id}`;
    let wrong = pickDistractors(a, members, id);
    if (wrong.length < DISTRACTORS) {
      const outside = everyone.filter((x) => !members.includes(x));
      wrong = [...wrong, ...pickDistractors(a, outside, `${id}|outside`, DISTRACTORS - wrong.length)];
    }
    return {
      id,
      image: (a.photo?.file ?? "").slice(ASSET_BASE.length),
      answer: a.id,
      options: [a, ...wrong].map((o) => ({ id: o.id, label: o.label })),
      caption: caption(a),
      ...(a.natoName ? { natoName: a.natoName } : {}),
      credit: a.photo?.credit,
    };
  });
}
