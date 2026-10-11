# Question pack format

A **pack** is one game (aircraft, flags, birds, country shapes…). It's a single
JSON file in this folder. To add a game:

1. Drop `yourgame.json` in `/public/packs/`.
2. Put its images in `/public/assets/yourgame/` (or use absolute image URLs).
3. Add `"yourgame.json"` to `/public/packs/index.json`.

No code changes. The app renders whatever packs the index lists.

---

## Top-level pack fields

| Field                | Type    | Required | Default | Notes |
|----------------------|---------|----------|---------|-------|
| `id`                 | string  | yes      | —       | Stable slug, e.g. `"aircraft"`. |
| `title`              | string  | yes      | —       | Shown on the picker and in-game. |
| `description`        | string  | no       | —       | One line on the picker. |
| `path`               | array   | no       | —       | Where the pack sits in the column browser, broad → specific, e.g. `["Aviation", "Helicopters", "Military"]`. Packs sharing a prefix share folders. |
| `category`           | string  | no       | `"Other"` | Shorthand for a one-level `path`. Ignored when `path` is set. |
| `categoryDescription`| string  | no       | —       | Blurb for the top-level category (first path segment). One pack per category is enough. |
| `theme.accent`       | string  | yes      | —       | Hex color for timer/selected/mode dot, e.g. `"#185FA5"`. |
| `assetBase`          | string  | no       | `""`    | Prefix for non-absolute image paths, e.g. `"assets/aircraft/"`. Include trailing slash. |
| `roundSeconds`       | number  | no       | `7`     | Time allowed per question. |
| `optionsPerQuestion` | number  | no       | `4`     | Buttons per question when options are auto-generated. |
| `shuffleOptions`     | boolean | no       | `true`  | Shuffle button order at runtime. |
| `shuffleQuestions`   | boolean | no       | `true`  | Shuffle question order at runtime. |
| `questions`          | array   | yes      | —       | Non-empty list of questions (below). |

## Question fields

| Field     | Type   | Required | Notes |
|-----------|--------|----------|-------|
| `id`      | string | yes      | Unique within the pack. |
| `image`   | string | yes      | Relative to `assetBase`, **or** an absolute `https://` / `data:` URL. |
| `answer`  | string | yes      | The `id` of the correct option. |
| `options` | array  | no       | Curated options `[{ "id", "label" }]`. Omit to auto-generate (see below). |
| `caption` | string | no       | Shown after answering (the "reveal"). |
| `credit`  | string | no       | Image attribution, shown small. Use this for CC-licensed photos. |
| `alt`     | string | no       | Alt text before the answer is revealed. |

---

## Two ways to supply options

**A. Auto-generated (recommended, least authoring).**
Omit `options`. The engine builds each question's buttons from a *pool* of every
distinct `answer` across the pack: the correct one plus `optionsPerQuestion - 1`
random distractors. You only write `answer` per question. The label shown for an
option is taken from whichever question first defines that answer id — so give
every answer id a human label somewhere, or use the curated form once to name it.

> Because auto-generated labels come from answer ids, the simplest robust pattern
> is to make the `answer` id itself the pool key and define labels via **one**
> curated question per distinct answer, or supply `options` on questions where the
> label matters. In practice most authors just use form B below for clarity.

**B. Curated per question (full control).**
Provide `options`. Use this when you want specific distractors — e.g. always
pairing a 747-8 with an A380 because they're commonly confused. The `answer` must
match one of the option `id`s. Order is shuffled at runtime unless
`shuffleOptions` is `false`.

```json
{
  "id": "ac-a380",
  "image": "a380.jpg",
  "answer": "a380",
  "options": [
    { "id": "a380", "label": "Airbus A380" },
    { "id": "b747-8", "label": "Boeing 747-8" },
    { "id": "b777-300er", "label": "Boeing 777-300ER" },
    { "id": "a350", "label": "Airbus A350-1000" }
  ]
}
```

---

## Minimal example

```json
{
  "id": "flags",
  "title": "Flag identification",
  "description": "Name the country from its flag.",
  "theme": { "accent": "#BA7517" },
  "assetBase": "assets/flags/",
  "questions": [
    {
      "id": "fl-jp",
      "image": "jp.svg",
      "answer": "japan",
      "options": [
        { "id": "japan", "label": "Japan" },
        { "id": "bangladesh", "label": "Bangladesh" },
        { "id": "palau", "label": "Palau" },
        { "id": "laos", "label": "Laos" }
      ]
    }
  ]
}
```

## Scoring (for reference)

Points per round come from `src/engine/scoring.ts`:
`base (300)` for any correct answer, plus up to `speedBonus (700)` scaled by how
much time was left when you answered. Wrong or timed-out = 0. Tune the constants
in that one file.

## Notes on images

- Keep images reasonably sized (long edge ~1200px) so the bundle stays small —
  GitHub Pages serves everything statically.
- The hero frame is `16 / 10` and uses `object-fit: contain`, so any aspect ratio
  displays without cropping.
- For Creative Commons photos, fill in `credit` with the attribution the license
  requires.
