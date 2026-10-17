import type {
  Option,
  Question,
  QuestionPack,
  PackIndex,
  ResolvedQuestion,
} from "./types";
import { cryptoRandom, sample } from "./random";

export const DEFAULTS = {
  roundSeconds: 7,
  optionsPerQuestion: 4,
  shuffleOptions: true,
  shuffleQuestions: true,
  /** Typed answers take longer than tapping, so typed mode stretches the round by this factor. */
  typedTimeMultiplier: 2,
} as const;

/** Base-path-aware asset URL. import.meta.env.BASE_URL is "/" locally, "/repo/" on Pages. */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const clean = path.replace(/^\/+/, "");
  return base.replace(/\/+$/, "/") + clean;
}

export function isAbsoluteUrl(s: string): boolean {
  return /^https?:\/\//i.test(s) || s.startsWith("data:");
}

/** A shuffled copy, using crypto randomness unless a seeded `rng` is passed (tests). */
export function shuffle<T>(arr: readonly T[], rng: () => number = cryptoRandom): T[] {
  return sample(arr, arr.length, rng);
}

/** The first label any question's options give each id, so a question without options can borrow one. */
export function answerLabels(pack: QuestionPack): Map<string, string> {
  const labels = new Map<string, string>();
  for (const q of pack.questions) {
    for (const o of q.options ?? []) {
      if (!labels.has(o.id)) labels.set(o.id, o.label);
    }
  }
  return labels;
}

/** A question's answer label: its own option first, then any other question's (`answerLabels`), then the raw id. */
export function answerLabel(q: Question, labels: Map<string, string>): string {
  return q.options?.find((o) => o.id === q.answer)?.label ?? labels.get(q.answer) ?? q.answer;
}

/**
 * The questions for one round, in play order. When the pack sets
 * `questionsPerRound` and has more questions than that, a random selection of
 * that many is taken each time. Shuffled unless the pack turns it off, in which
 * case the selection keeps the pack's own order.
 */
export function orderQuestions(pack: QuestionPack, rng: () => number = cryptoRandom): Question[] {
  const shouldShuffle = pack.shuffleQuestions ?? DEFAULTS.shuffleQuestions;
  const limit = pack.questionsPerRound;
  const chosen = limit && limit < pack.questions.length ? new Set(sample(pack.questions, limit, rng)) : null;
  const questions = chosen ? pack.questions.filter((q) => chosen.has(q)) : pack.questions.slice();
  return shouldShuffle ? shuffle(questions, rng) : questions;
}

/** How many questions a round of this pack has. */
export function roundLength(pack: QuestionPack): number {
  const limit = pack.questionsPerRound;
  return limit ? Math.min(limit, pack.questions.length) : pack.questions.length;
}

/** Every distinct correct answer in the pack becomes a candidate distractor. */
function buildPool(pack: QuestionPack): Option[] {
  const labels = answerLabels(pack);
  const seen = new Map<string, Option>();
  for (const q of pack.questions) {
    if (!seen.has(q.answer)) seen.set(q.answer, { id: q.answer, label: answerLabel(q, labels) });
  }
  return [...seen.values()];
}

export function resolveImage(pack: QuestionPack, q: Question): string {
  if (isAbsoluteUrl(q.image)) return q.image;
  const base = pack.assetBase ?? "";
  return withBase(base + q.image);
}

/**
 * Produce the concrete options for a question:
 *  - if the question supplies its own options, use them;
 *  - otherwise draw distractors from the pool (correct + N-1 others).
 * Order is shuffled unless the pack disables it.
 */
export function resolveOptions(
  pack: QuestionPack,
  q: Question,
  pool: Option[],
  rng: () => number = cryptoRandom
): Option[] {
  const shouldShuffle = pack.shuffleOptions ?? DEFAULTS.shuffleOptions;
  const count = pack.optionsPerQuestion ?? DEFAULTS.optionsPerQuestion;

  if (q.options && q.options.length > 0) {
    return shouldShuffle ? shuffle(q.options, rng) : q.options.slice();
  }

  const correct = pool.find((o) => o.id === q.answer);
  if (!correct) {
    throw new Error(
      `Pack "${pack.id}": question "${q.id}" has answer "${q.answer}" not found in pool.`
    );
  }

  const distractors = shuffle(
    pool.filter((o) => o.id !== q.answer),
    rng
  ).slice(0, Math.max(0, count - 1));

  const options = [correct, ...distractors];
  return shouldShuffle ? shuffle(options, rng) : options;
}

/** Resolve an entire pack into render-ready questions. */
export function resolvePack(
  pack: QuestionPack,
  rng: () => number = cryptoRandom
): ResolvedQuestion[] {
  const pool = buildPool(pack);
  return orderQuestions(pack, rng).map((q) => ({
    ...q,
    resolvedImage: resolveImage(pack, q),
    resolvedOptions: resolveOptions(pack, q, pool, rng),
  }));
}

/** Basic structural validation with actionable messages. Throws on the first problem. */
export function validatePack(pack: QuestionPack): void {
  const where = `Pack "${pack?.id ?? "(missing id)"}"`;
  if (!pack.id) throw new Error(`${where}: missing "id".`);
  if (!pack.title) throw new Error(`${where}: missing "title".`);
  if (!pack.theme?.accent) throw new Error(`${where}: missing "theme.accent".`);
  if (
    pack.path !== undefined &&
    !(Array.isArray(pack.path) && pack.path.every((s) => typeof s === "string" && s.trim()))
  )
    throw new Error(`${where}: "path" must be an array of non-empty strings.`);
  if (!Array.isArray(pack.questions) || pack.questions.length === 0)
    throw new Error(`${where}: "questions" must be a non-empty array.`);
  if (pack.questionsPerRound !== undefined && !(Number.isInteger(pack.questionsPerRound) && pack.questionsPerRound > 0))
    throw new Error(`${where}: "questionsPerRound" must be a positive whole number.`);

  const ids = new Set<string>();
  for (const q of pack.questions) {
    if (!q.id) throw new Error(`${where}: a question is missing "id".`);
    if (ids.has(q.id)) throw new Error(`${where}: duplicate question id "${q.id}".`);
    ids.add(q.id);
    if (!q.image) throw new Error(`${where}: question "${q.id}" missing "image".`);
    if (!q.answer) throw new Error(`${where}: question "${q.id}" missing "answer".`);
    if (q.options && !q.options.some((o) => o.id === q.answer))
      throw new Error(
        `${where}: question "${q.id}" answer "${q.answer}" is not among its own options.`
      );
  }
}

// ---- Loading over the network --------------------------------------------

export async function loadPackIndex(): Promise<PackIndex> {
  const res = await fetch(withBase("packs/index.json"));
  if (!res.ok) throw new Error(`Could not load pack index (${res.status}).`);
  return res.json();
}

export async function loadPack(filename: string): Promise<QuestionPack> {
  const res = await fetch(withBase(`packs/${filename}`));
  if (!res.ok) throw new Error(`Could not load pack "${filename}" (${res.status}).`);
  const pack = (await res.json()) as QuestionPack;
  validatePack(pack);
  return pack;
}
