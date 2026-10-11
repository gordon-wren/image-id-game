# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm test           # run engine unit tests (vitest, one-shot)
npm run test:watch # vitest in watch mode
npm run packs      # regenerate aircraft packs from the dataset + recipes
npm run build      # tsc + vite build → dist/
npm run deploy     # build + gh-pages push to gh-pages branch
```

Run a single test file: `npx vitest run src/engine/scoring.test.ts`

## Architecture

**Engine / UI split** — `src/engine/` is pure TypeScript with no React or DOM dependencies. `src/components/` is all React. The engine is independently testable and designed to be portable (e.g. lifted to a server endpoint for anti-cheat).

**Pack system** — the game is data-driven. A "pack" is a JSON file in `public/packs/` matching the `QuestionPack` type (`src/engine/types.ts`). The app fetches `public/packs/index.json` at startup to discover packs. No code changes are needed to add a game — only:
1. `public/packs/yourgame.json`
2. `public/assets/yourgame/` (images)
3. Add filename to `public/packs/index.json`

**Generated aircraft packs** — most aviation packs are built, not hand-written. `scripts/aircraft-dataset/build.mjs` scrapes Wikipedia/Wikidata/Commons into `public/data/aircraft.json` + `public/assets/aircraft/` (one photo per type, usable licenses only). `scripts/packs/generate.mjs` turns each entry of `scripts/packs/recipes.json` (filter by `group`, `country`, `firstFlight` range, `ids`) into a pack with curated, similarity-ranked distractors; it marks its output with `generatedFrom`. To add a quiz, add a recipe and run `npm run packs` — never edit a generated pack by hand. `scripts/packs/packs.test.mjs` fails if a generated pack is stale or any pack points at a missing image. `large-airliners.json` stays hand-written because it asks about variants (777-200 vs 777-300ER) the dataset doesn't split.

**Category tree / column browser** — the menu is a Finder-style column browser (`src/components/ColumnBrowser.tsx`): each column drills one level deeper, and selecting a pack opens a preview column with a Play button. Each pack declares an optional `path` array (e.g. `["Aviation", "Helicopters", "Military"]`); packs sharing a prefix share folders, and a folder can hold both sub-folders and packs (`src/engine/categories.ts`). `category` is shorthand for a one-level path; packs with neither land under "Other". New folders need no code changes — just use the name in a pack's `path`. Optionally set `categoryDescription` on one pack per top-level category for its blurb. On phones the browser shows one column at a time with a breadcrumb for going back.

**Pack loading & resolution** (`src/engine/pack.ts`) — fetches, validates, and resolves packs at runtime: prepends `assetBase` + Vite's `base` path to relative image URLs, generates distractor options from the pool of all distinct `answer` ids in the pack when a question omits `options`.

**Flashcard study mode** (`src/engine/flashcards.ts`, `src/components/Study.tsx`) — a second way to use any pack, opened from the Study button under Play in the column browser's pack preview. `buildDeck` turns a pack into image/label cards, sharing `orderQuestions` and `answerLabel` with the game (`pack.ts`) so both show the same names; the study session is a pure state object advanced by `flip` and `mark`, with "Still learning" cards re-queued at the back until all are known.

**Scoring** (`src/engine/scoring.ts`) — pure function: `base (300)` for correct + up to `speedBonus (700)` scaled by time remaining. Tune both constants here.

**Answer modes** — a topbar toggle (`src/engine/useAnswerMode.ts`, persisted to `localStorage`) switches between the four-button grid and typed entry. Typed mode (`src/components/TypedAnswer.tsx`) fuzzy-searches a catalog of every option/answer label across *all* packs (`src/engine/names.ts`), so knowing the pack doesn't narrow the answer; answers are compared by normalized name, not id. Rounds get `DEFAULTS.typedTimeMultiplier` (2×) the pack's time.

**Theming** — light/dark defined as CSS custom properties in `src/styles/global.css`, toggled via `data-theme` on `<html>`. Each pack supplies its own `theme.accent` hex color applied to the timer bar, selected state, and mode dot. Toggle persists to `localStorage`; respects system preference on first visit (`src/engine/useTheme.ts`).

## GitHub Pages deployment

`REPO_BASE` in `vite.config.ts` must match the repo name for project pages (e.g. `"/image-id-game/"`). Set to `"/"` for user/org pages or a custom domain. The CI workflow (`.github/workflows/deploy.yml`) runs tests → build → copies `dist/index.html` to `dist/404.html` (SPA fallback) → deploys on push to `main`.
