import type { Flashcard, QuestionPack } from "./types";
import { DEFAULTS, resolveImage, shuffle } from "./pack";

/**
 * Map every answer id in the pack to its display label. A label can come from
 * any question's options, so a question that omits `options` still gets a
 * proper name if another question lists it. Falls back to the raw id.
 */
export function answerLabels(pack: QuestionPack): Map<string, string> {
  const labels = new Map<string, string>();
  for (const q of pack.questions) {
    for (const o of q.options ?? []) {
      if (!labels.has(o.id)) labels.set(o.id, o.label);
    }
  }
  for (const q of pack.questions) {
    if (!labels.has(q.answer)) labels.set(q.answer, q.answer);
  }
  return labels;
}

/** Build a study deck from a pack, one card per question. Honors `shuffleQuestions`. */
export function buildDeck(
  pack: QuestionPack,
  rng: () => number = Math.random
): Flashcard[] {
  const labels = answerLabels(pack);
  const shouldShuffle = pack.shuffleQuestions ?? DEFAULTS.shuffleQuestions;
  const questions = shouldShuffle ? shuffle(pack.questions, rng) : pack.questions.slice();
  return questions.map((q) => ({
    id: q.id,
    resolvedImage: resolveImage(pack, q),
    label: labels.get(q.answer) ?? q.answer,
    caption: q.caption,
    credit: q.credit,
    alt: q.alt,
  }));
}

// ---- Study session --------------------------------------------------------
// Quizlet-style loop: flip a card, then mark it "Got it" or "Still learning".
// Cards still being learned go to the back of the queue and come round again,
// so the session ends once every card has been marked "Got it".

export interface StudySession {
  /** Cards left to study; the first one is the current card. */
  queue: Flashcard[];
  /** Whether the current card is showing its answer side. */
  flipped: boolean;
  /** Ids of cards marked "Got it", in the order they were learned. */
  known: string[];
  /** Ids of cards marked "Still learning" at least once. */
  missed: string[];
  /** Total cards in the deck. */
  total: number;
}

export function startSession(deck: Flashcard[]): StudySession {
  return { queue: deck.slice(), flipped: false, known: [], missed: [], total: deck.length };
}

export function currentCard(s: StudySession): Flashcard | undefined {
  return s.queue[0];
}

export function isComplete(s: StudySession): boolean {
  return s.queue.length === 0;
}

export function flip(s: StudySession): StudySession {
  if (isComplete(s)) return s;
  return { ...s, flipped: !s.flipped };
}

/** Mark the current card and advance. "Still learning" re-queues it at the back. */
export function mark(s: StudySession, gotIt: boolean): StudySession {
  const [card, ...rest] = s.queue;
  if (!card) return s;
  if (gotIt) {
    return { ...s, queue: rest, flipped: false, known: [...s.known, card.id] };
  }
  return {
    ...s,
    queue: [...rest, card],
    flipped: false,
    missed: s.missed.includes(card.id) ? s.missed : [...s.missed, card.id],
  };
}

/** Cards known on the first try (never marked "Still learning"). */
export function firstTryCount(s: StudySession): number {
  return s.known.filter((id) => !s.missed.includes(id)).length;
}
