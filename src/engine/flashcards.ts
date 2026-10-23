import type { Flashcard, QuestionPack } from "./types";
import { answerLabel, answerLabels, orderQuestions, resolveImage } from "./pack";
import { cryptoRandom } from "./random";

/** Build a study deck from a pack, one card per question. Honors `shuffleQuestions`. */
export function buildDeck(
  pack: QuestionPack,
  rng: () => number = cryptoRandom
): Flashcard[] {
  const labels = answerLabels(pack);
  return orderQuestions(pack, rng).map((q) => ({
    id: q.id,
    resolvedImage: resolveImage(pack, q),
    label: answerLabel(q, labels),
    caption: q.caption,
    natoName: q.natoName,
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
  /** Counts marks, so every card shown gets a fresh key even when the same card comes round again. */
  step: number;
}

export function startSession(deck: Flashcard[]): StudySession {
  return { queue: deck.slice(), flipped: false, known: [], missed: [], total: deck.length, step: 0 };
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

/**
 * Mark the current card and advance. "Still learning" re-queues it at the back.
 * Does nothing until the card has been flipped, so a card can't be marked unseen.
 */
export function mark(s: StudySession, gotIt: boolean): StudySession {
  const [card, ...rest] = s.queue;
  if (!card || !s.flipped) return s;
  const step = s.step + 1;
  if (gotIt) {
    return { ...s, queue: rest, flipped: false, step, known: [...s.known, card.id] };
  }
  return {
    ...s,
    queue: [...rest, card],
    flipped: false,
    step,
    missed: s.missed.includes(card.id) ? s.missed : [...s.missed, card.id],
  };
}

/** Cards known on the first try (never marked "Still learning"). */
export function firstTryCount(s: StudySession): number {
  return s.known.filter((id) => !s.missed.includes(id)).length;
}
