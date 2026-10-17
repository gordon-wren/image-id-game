# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm test           # run engine unit tests (vitest, one-shot)
npm run test:watch # vitest in watch mode
npm run packs      # regenerate the aircraft menu from the dataset + taxonomy
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

**Generated aircraft packs** — most aviation packs are built, not hand-written. `scripts/aircraft-dataset/build.mjs` scrapes Wikipedia/Wikidata/Commons into `public/data/aircraft.json` + `public/assets/aircraft/` (one photo per type, usable licenses only). Every aircraft has curated `use` (military/civil), `category` (fighter, tanker, utility-helicopter…) and `engine` (piston/jet/turboprop/turboshaft) attributes. The menu is not listed by hand: `scripts/packs/generate.mjs` expands `scripts/packs/taxonomy.json` — menus that split a slice of the dataset by era or decade (by **service-entry year**; not-yet-in-service types are left out), by country (old names folded via `nationAliases`; joint aircraft go in **Multinational**), or into explicit sets with their own filters (roles, civil classes). A set becomes a pack only with at least `minAircraft` (5) aircraft; a folder holding a single item is folded into its parent; each round draws at most `questionsPerRound` (20) questions at random with Web Crypto (`src/engine/random.ts`). Packs get curated, similarity-ranked distractors and are marked `generatedFrom`; never edit one by hand, change the taxonomy or the data and run `npm run packs`. High scores of packs renamed by this change carry over via `PREVIOUS_IDS` in `src/engine/highScores.ts`. New aircraft are added through a review page first: see `docs/aircraft-review.md` and `scripts/aircraft-review/`. `scripts/packs/packs.test.mjs` fails if a generated pack is stale, any pack points at a missing image, or a menu folder below the top level holds fewer than two items. `large-airliners.json` stays hand-written because it asks about variants (777-200 vs 777-300ER) the dataset doesn't split.

**Category tree / column browser** — the menu is a Finder-style column browser (`src/components/ColumnBrowser.tsx`): each column drills one level deeper, and selecting a pack opens a preview column with a Play button. Each pack declares an optional `path` array (e.g. `["Aviation", "Helicopters", "Military"]`); packs sharing a prefix share folders, and a folder can hold both sub-folders and packs (`src/engine/categories.ts`). `category` is shorthand for a one-level path; packs with neither land under "Other". New folders need no code changes — just use the name in a pack's `path`. Optionally set `categoryDescription` on one pack per top-level category for its blurb. On phones the browser shows one column at a time with a breadcrumb for going back.

**Pack loading & resolution** (`src/engine/pack.ts`) — fetches, validates, and resolves packs at runtime: prepends `assetBase` + Vite's `base` path to relative image URLs, generates distractor options from the pool of all distinct `answer` ids in the pack when a question omits `options`.

**Flashcard study mode** (`src/engine/flashcards.ts`, `src/components/Study.tsx`) — a second way to use any pack, chosen with the **Mode: Play / Study** pill in the top bar (`src/engine/usePlayMode.ts`, persisted to `localStorage`); in Study mode the browser's main button, Enter and double-click open flashcards instead of the game, and the Answer and Timer pills are hidden. `buildDeck` turns a pack into image/label cards, sharing `orderQuestions` and `answerLabel` with the game (`pack.ts`) so both show the same names; the study session is a pure state object advanced by `flip` and `mark`, with "Still learning" cards re-queued at the back until all are known.

**Aircraft collection** — every correct answer in the game "catches" that aircraft. `npm run packs` writes the catalog `public/data/collection.json`: one entry per aircraft across all packs (dataset aircraft keyed by id, so an aircraft in several packs is one entry; others keyed `<pack>/<answer>`), with permanent append-only numbers, facts from the dataset, and an `aliases` map from `<pack>/<answer>` to entry key — the app never derives keys itself. `src/engine/collection.ts` is the pure logic (catch, counts, repeat-safe merge); `collectionStore.ts` is the only code touching `localStorage`; `useCollection` saves synchronously so a catch survives quitting mid-round. Study mode never catches. UI: `src/components/Collection.tsx`, opened from the **Collection** pill or the round summary.

**Scoring** (`src/engine/scoring.ts`) — pure function: `base (300)` for correct + up to `speedBonus (700)` scaled by time remaining. Tune both constants here.

**Answer modes** — a topbar toggle (`src/engine/useAnswerMode.ts`, persisted to `localStorage`) switches between the four-button grid and typed entry. Typed mode (`src/components/TypedAnswer.tsx`) fuzzy-searches a catalog of every option/answer label across *all* packs (`src/engine/names.ts`), so knowing the pack doesn't narrow the answer; answers are compared by normalized name, not id. Rounds get `DEFAULTS.typedTimeMultiplier` (2×) the pack's time.

**Theming** — light/dark defined as CSS custom properties in `src/styles/global.css`, toggled via `data-theme` on `<html>`. Each pack supplies its own `theme.accent` hex color applied to the timer bar, selected state, and mode dot. Toggle persists to `localStorage`; respects system preference on first visit (`src/engine/useTheme.ts`).

## GitHub Pages deployment

`REPO_BASE` in `vite.config.ts` must match the repo name for project pages (e.g. `"/image-id-game/"`). Set to `"/"` for user/org pages or a custom domain. The CI workflow (`.github/workflows/deploy.yml`) runs tests → build → copies `dist/index.html` to `dist/404.html` (SPA fallback) → deploys on push to `main`.
