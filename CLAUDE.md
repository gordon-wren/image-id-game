# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm test           # run engine unit tests (vitest, one-shot)
npm run test:watch # vitest in watch mode
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

**Category tree** — the menu is a two-level tree: a top-level `category` screen, then the packs within it. Each pack declares an optional `category` display string (e.g. `"Aviation"`, `"Auto"`); packs sharing a category are grouped together (`src/engine/categories.ts`), and packs without one land under "Other". To add a new superset, just give a pack's `category` field the new name — no other code changes needed. Optionally set `categoryDescription` on one pack per category for the one-line blurb shown under the category title.

**Pack loading & resolution** (`src/engine/pack.ts`) — fetches, validates, and resolves packs at runtime: prepends `assetBase` + Vite's `base` path to relative image URLs, generates distractor options from the pool of all distinct `answer` ids in the pack when a question omits `options`.

**Flashcard study mode** (`src/engine/flashcards.ts`, `src/components/Study.tsx`) — a second way to use any pack, opened from the Study button in the picker. `buildDeck` turns a pack into image/label cards (labels looked up from any question's options); the study session is a pure state object advanced by `flip` and `mark`, with "Still learning" cards re-queued at the back until all are known.

**Scoring** (`src/engine/scoring.ts`) — pure function: `base (300)` for correct + up to `speedBonus (700)` scaled by time remaining. Tune both constants here.

**Theming** — light/dark defined as CSS custom properties in `src/styles/global.css`, toggled via `data-theme` on `<html>`. Each pack supplies its own `theme.accent` hex color applied to the timer bar, selected state, and mode dot. Toggle persists to `localStorage`; respects system preference on first visit (`src/engine/useTheme.ts`).

## GitHub Pages deployment

`REPO_BASE` in `vite.config.ts` must match the repo name for project pages (e.g. `"/image-id-game/"`). Set to `"/"` for user/org pages or a custom domain. The CI workflow (`.github/workflows/deploy.yml`) runs tests → build → copies `dist/index.html` to `dist/404.html` (SPA fallback) → deploys on push to `main`.
