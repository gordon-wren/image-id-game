import { describe, it, expect } from "vitest";
import { answerLabels } from "./pack";
import {
  buildDeck,
  currentCard,
  firstTryCount,
  flip,
  isComplete,
  mark,
  startSession,
} from "./flashcards";
import type { QuestionPack } from "./types";
import type { StudySession } from "./flashcards";

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const pack: QuestionPack = {
  id: "test",
  title: "Test",
  theme: { accent: "#185FA5" },
  assetBase: "assets/test/",
  shuffleQuestions: false,
  questions: [
    {
      id: "q1",
      image: "a.jpg",
      answer: "a",
      caption: "Cap A",
      options: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Bravo" },
      ],
    },
    // No options of its own; label comes from q1's options.
    { id: "q2", image: "b.jpg", answer: "b" },
    // Label nowhere in the pack; falls back to the id.
    { id: "q3", image: "https://example.com/c.jpg", answer: "c" },
  ],
};

describe("answerLabels", () => {
  it("finds labels from any question's options", () => {
    const labels = answerLabels(pack);
    expect(labels.get("a")).toBe("Alpha");
    expect(labels.get("b")).toBe("Bravo");
    expect(labels.has("c")).toBe(false);
  });
});

describe("buildDeck", () => {
  it("makes one card per question with resolved image and label", () => {
    const deck = buildDeck(pack);
    expect(deck.map((c) => c.id)).toEqual(["q1", "q2", "q3"]);
    expect(deck.map((c) => c.label)).toEqual(["Alpha", "Bravo", "c"]);
    expect(deck[0].resolvedImage).toMatch(/assets\/test\/a\.jpg$/);
    expect(deck[0].caption).toBe("Cap A");
    expect(deck[2].resolvedImage).toBe("https://example.com/c.jpg");
  });

  it("prefers the question's own label over one borrowed from another question", () => {
    const deck = buildDeck({
      ...pack,
      questions: [
        { id: "q1", image: "a.jpg", answer: "a", options: [{ id: "a", label: "A" }, { id: "747", label: "Boeing 747" }] },
        { id: "q2", image: "b.jpg", answer: "747", options: [{ id: "747", label: "Boeing 747-8" }, { id: "a", label: "A" }] },
      ],
    });
    expect(deck.map((c) => c.label)).toEqual(["A", "Boeing 747-8"]);
  });

  it("shuffles when the pack allows it, keeping every card", () => {
    const deck = buildDeck({ ...pack, shuffleQuestions: true }, seeded(5));
    expect(deck.map((c) => c.id).sort()).toEqual(["q1", "q2", "q3"]);
  });

  it("builds a valid deck from every shipped pack", () => {
    const shipped = import.meta.glob<QuestionPack>("../../public/packs/*.json", {
      eager: true,
      import: "default",
    });
    const index = shipped["../../public/packs/index.json"] as unknown as string[];
    expect(index.length).toBeGreaterThan(0);
    for (const file of index) {
      const p = shipped[`../../public/packs/${file}`];
      const deck = buildDeck(p, seeded(1));
      expect(deck).toHaveLength(p.questions.length);
      for (const card of deck) {
        expect(card.label).toBeTruthy();
        expect(card.resolvedImage).toBeTruthy();
      }
    }
  });
});

describe("study session", () => {
  const deck = buildDeck(pack);
  /** Flip the current card, then mark it, as a player must. */
  const answer = (s: StudySession, gotIt: boolean) => mark(flip(s), gotIt);

  it("starts on the first card, face down", () => {
    const s = startSession(deck);
    expect(currentCard(s)?.id).toBe("q1");
    expect(s.flipped).toBe(false);
    expect(isComplete(s)).toBe(false);
  });

  it("flips back and forth", () => {
    const s = flip(startSession(deck));
    expect(s.flipped).toBe(true);
    expect(flip(s).flipped).toBe(false);
  });

  it("advances and resets to the front when a card is known", () => {
    const s = answer(startSession(deck), true);
    expect(currentCard(s)?.id).toBe("q2");
    expect(s.flipped).toBe(false);
    expect(s.known).toEqual(["q1"]);
  });

  it("re-queues a card still being learned at the back", () => {
    const s = answer(startSession(deck), false);
    expect(s.queue.map((c) => c.id)).toEqual(["q2", "q3", "q1"]);
    expect(s.missed).toEqual(["q1"]);
  });

  it("completes once every card is known and counts first-try cards", () => {
    let s = startSession(deck);
    s = answer(s, false); // q1 back of queue
    s = answer(s, true); // q2
    s = answer(s, true); // q3
    s = answer(s, false); // q1 again, still missed once
    s = answer(s, true); // q1
    expect(isComplete(s)).toBe(true);
    expect(s.known).toEqual(["q2", "q3", "q1"]);
    expect(s.missed).toEqual(["q1"]);
    expect(firstTryCount(s)).toBe(2);
    expect(mark(s, true)).toBe(s);
    expect(flip(s)).toBe(s);
  });

  it("won't mark a card that hasn't been flipped", () => {
    const s = startSession(deck);
    expect(mark(s, true)).toBe(s);
    expect(mark(s, false)).toBe(s);
  });

  it("counts a step per mark, even when the only card left comes round again", () => {
    let s = startSession(deck);
    s = answer(s, true);
    s = answer(s, true);
    expect(s.step).toBe(2);
    s = answer(s, false); // q3 is the only card left and is re-queued
    expect(currentCard(s)?.id).toBe("q3");
    expect(s.step).toBe(3);
  });
});
