// ============================================================================
// QUESTION PACK FORMAT
// ============================================================================
// This is the contract you author your quiz sets against. Drop a JSON file
// matching `QuestionPack` into /public/packs/, add its filename to
// /public/packs/index.json, and the game picks it up with zero code changes.
//
// See /public/packs/SCHEMA.md for the human-readable spec and examples.
// ============================================================================

/** A single option a player can choose. `id` is what `Question.answer` references. */
export interface Option {
  /** Stable identifier, unique within the question (or within the pack pool). */
  id: string;
  /** Text shown on the answer button, e.g. "Boeing 747-8". */
  label: string;
}

export interface Question {
  /** Unique within the pack. Used for keys and (later) result tracking. */
  id: string;

  /**
   * Image to identify. Either:
   *  - a path relative to the pack's `assetBase` (recommended, e.g. "747-8.jpg"), or
   *  - an absolute URL (e.g. a Wikimedia Commons file URL).
   */
  image: string;

  /** The `Option.id` of the correct answer. */
  answer: string;

  /**
   * How the four buttons are built for this question. Optional.
   *  - Omitted  -> options are generated from the pack pool (correct + distractors).
   *  - Provided -> these exact options are used, in the order given (then shuffled
   *                at runtime unless `pack.shuffleOptions` is false).
   * Use this when you want curated distractors (e.g. pairing a 747-8 with an A380).
   */
  options?: Option[];

  /** Optional caption shown after answering, e.g. "Cathay Pacific, 2019". */
  caption?: string;

  /** Optional image attribution, shown small in the result state. Recommended for CC images. */
  credit?: string;

  /** Optional alt text for the image, for accessibility. Falls back to a generic string. */
  alt?: string;
}

export interface PackTheme {
  /**
   * Accent color for this game mode as a hex string, e.g. "#185FA5".
   * Applied to the timer, selected states, and the mode dot.
   */
  accent: string;
}

export interface QuestionPack {
  /** Stable slug, e.g. "aircraft". Used in URLs and storage keys. */
  id: string;

  /** Display name, e.g. "Aircraft identification". */
  title: string;

  /** One-line description shown on the pack picker, e.g. "Name the airliner from its silhouette." */
  description?: string;

  /**
   * Display name of the superset this pack belongs to, e.g. "Aviation" or "Auto".
   * Packs sharing a category are grouped together in the picker. Omitted packs
   * are grouped under "Other".
   */
  category?: string;

  /**
   * Where this pack sits in the column browser, from broadest to most specific,
   * e.g. ["Aviation", "Helicopters", "Military"]. Packs sharing a prefix share
   * those folders. Takes precedence over `category`, which is shorthand for a
   * one-level path.
   */
  path?: string[];

  /**
   * One-line blurb shown for this pack's top-level category (the first path
   * segment), e.g. "Airliners, fighters, and helicopters." Only needs to be set
   * on one pack per category — the first non-empty one found wins.
   */
  categoryDescription?: string;

  theme: PackTheme;

  /**
   * Base path prepended to any non-absolute `Question.image`.
   * Relative to the site root, e.g. "assets/aircraft/". Include the trailing slash.
   * Ignored for questions whose `image` is already an absolute URL.
   */
  assetBase?: string;

  /** Seconds allowed per question before it auto-fails. Default 7. */
  roundSeconds?: number;

  /**
   * When a question omits `options`, this many buttons are generated:
   * the correct one plus (optionsPerQuestion - 1) distractors drawn from
   * the pool of all correct answers across the pack. Default 4.
   */
  optionsPerQuestion?: number;

  /** Shuffle option order at runtime. Default true. */
  shuffleOptions?: boolean;

  /** Shuffle question order at runtime. Default true. */
  shuffleQuestions?: boolean;

  /**
   * Set on packs written by scripts/packs/generate.mjs (to the recipes file it
   * read). Such packs are overwritten on the next run — edit the recipe instead.
   */
  generatedFrom?: string;

  questions: Question[];
}

// ---- The pack index -------------------------------------------------------
// /public/packs/index.json is just an array of pack filenames to load:
//   ["aircraft.json", "flags.json"]
export type PackIndex = string[];

// ---- Runtime shapes (not authored — produced by the engine) ---------------

export interface ResolvedQuestion extends Question {
  /** Fully-resolved image URL (assetBase + image, base-path aware). */
  resolvedImage: string;
  /** The concrete options shown for this question, already ordered. */
  resolvedOptions: Option[];
}

export interface RoundResult {
  questionId: string;
  correct: boolean;
  msElapsed: number;
  points: number;
  timedOut: boolean;
}

// ---- Flashcard study mode -------------------------------------------------

/** One study card: the image on the front, the answer on the back. */
export interface Flashcard {
  /** The `Question.id` this card was built from. */
  id: string;
  /** Fully-resolved image URL for the front of the card. */
  resolvedImage: string;
  /** Answer text for the back of the card, e.g. "Boeing 747-8". */
  label: string;
  caption?: string;
  credit?: string;
  alt?: string;
}
