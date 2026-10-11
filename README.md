# Spot — image identification game

A single-player, game-agnostic image identification quiz. Show a photo, four
answers, a draining timer; points scale with speed and correctness. One codebase
supports any game type (aircraft, flags, birds, country shapes…) — each game is
just a JSON pack.

Built with React + TypeScript + Vite. Ships as a fully static site (no backend),
deployable to GitHub Pages.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # run engine unit tests
npm run build      # production build to dist/
```

## Adding a game

You author packs against a documented schema — no code changes needed. See
[`public/packs/SCHEMA.md`](public/packs/SCHEMA.md). In short:

1. Add `yourgame.json` to `public/packs/`.
2. Add its images to `public/assets/yourgame/`.
3. List the file in `public/packs/index.json`.

## Project layout

```
src/
  engine/        pure, tested logic — no React, no DOM
    types.ts       the pack/question contract
    scoring.ts     score(correct, msElapsed, roundMs) -> points
    pack.ts        load, validate, resolve packs; option generation
    flashcards.ts  study deck + flip/mark session for flashcard mode
    useTimer.ts    wall-clock countdown hook
    useTheme.ts    light/dark toggle, persisted
  components/    ColumnBrowser, Game, Study, Summary, Timer, AnswerGrid, ResultBanner
  styles/        global.css — both themes as CSS custom properties
public/
  packs/         *.json packs + index.json + SCHEMA.md
  assets/        per-game images
```

The **engine** folder is deliberately free of React and DOM code. `scoring.ts` in
particular is a pure function so it's trivially testable and can be lifted into a
server endpoint unchanged if you later add a leaderboard with server-side
anti-cheat.

## Themes

Two flavors — editorial light and focused dark — both defined as CSS custom
properties in `src/styles/global.css`, switched by `data-theme` on `<html>`. Each
pack sets its own `--accent`. Toggle persists to `localStorage` and respects the
system preference on first visit.

## Deploying to GitHub Pages

1. **Set the base path.** In `vite.config.ts`, `REPO_BASE` must match your repo
   name for project pages: `"/your-repo-name/"`. If you use a user page
   (`username.github.io`) or a custom domain served from root, set it to `"/"`.

2. **Enable Pages.** In the repo: Settings → Pages → Build and deployment →
   Source → **GitHub Actions**.

3. **Push to `main`.** The workflow in `.github/workflows/deploy.yml` runs tests,
   builds, adds a `404.html` SPA fallback, and deploys automatically.

Manual alternative: `npm run deploy` (uses the `gh-pages` package to push `dist/`
to a `gh-pages` branch).

## Flashcard study mode

Switch the **Mode** pill in the top bar from **Play** to **Study**, then open any pack. Study mode turns
the pack into flip cards: the image on the front, the answer on the back. After
flipping, mark the card **Got it** or **Still learning**; cards still being
learned go to the back of the deck and come round again until every card is
known. Keyboard: Space/Enter flips, 1 (or ←) is still learning, 2 (or →) is
got it. No timer and no score; it reuses the same pack files, so new packs get
a flashcard deck for free.

## Scoring

`base` (300) for any correct answer, plus up to `speedBonus` (700) scaled by time
remaining. Wrong or timed-out rounds score 0. Tune both constants in
`src/engine/scoring.ts`.

## Roadmap hooks (single-player today, extensible tomorrow)

- **Leaderboard / accounts:** move `score()` behind an `/api/submit` endpoint;
  the function is already pure and server-ready.
- **Multiplayer:** the pack/round model is stateless per question, so a room can
  broadcast the same resolved question set to several clients.
- **iPhone app:** the layout is single-column and viewport-driven; wrap in
  Capacitor (or a thin React Native port) reusing the engine untouched.
