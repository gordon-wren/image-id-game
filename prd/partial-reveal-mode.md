# Partial reveal mode

**Status:** Draft (questions 7 to 14 not yet answered by Gordon; defaults used)
**Owner:** Gordon
**Last updated:** 2026-10-11

## Summary

A new game mode inspired by logo quiz games: the player sees only a small piece or the outline of an aircraft and has to identify it. Each wrong guess reveals more. A correct guess fills in the whole image with a satisfying reveal, and catches the entry in the [aircraft collection](aircraft-collection.md).

## Goals

- Test recognition of distinctive features (tail, intake, rotor head, nose) rather than the whole aircraft.
- Add variety alongside the existing timed quiz.
- Reward expertise: fewer reveals earn more points.

## Non-goals

- Typed answers. Multiple choice stays, as in the main quiz.
- Changes to the existing timed quiz.
- An iPhone app.

## Requirements

### Mode selection

1. Partial reveal is a separate mode the player picks after choosing a pack (alongside the standard quiz and the flashcard study mode).
2. It uses the same packs and questions as the standard quiz. No new pack is needed.

### Reveal styles

3. Two reveal styles at launch:
   - **Crop:** a small zoomed-in region of the image, such as a tail fin or cockpit.
   - **Outline:** only the edge outline of the aircraft, with no fill or color.
4. Each question uses one style, chosen at random unless the pack specifies one.
5. Packs may define the crop region per question (see Pack format changes). Without one, the crop is taken from a random point on the aircraft. A random crop must avoid empty sky or background (see Open questions).

### Guessing and reveal steps

6. The player picks from multiple choice buttons, as in the standard quiz.
7. There are up to 4 stages: the starting view plus 3 reveals.
   - Crop: each wrong guess zooms out so more of the aircraft shows.
   - Outline: each wrong guess adds detail (outline, then rough fill, then partial color).
8. A wrong option is greyed out and can't be picked again.
9. After the third wrong guess the full image shows, the answer is marked, and the question counts as missed.
10. A correct guess at any stage animates to the full image, shows the name, and moves on.
11. No per-question timer by default, since the challenge is the reveal level, not speed. A pack's `roundSeconds` is ignored in this mode.

### Scoring

12. Fewer reveals earn more points:

    | Correct at stage | Points |
    |------------------|--------|
    | 1 (no reveals)   | 1000   |
    | 2                | 600    |
    | 3                | 300    |
    | 4                | 100    |
    | Missed           | 0      |

13. Scoring lives in `src/engine/scoring.ts` as a pure function, next to the existing scoring, so it can be tested and tuned.
14. High scores are tracked separately per pack for this mode.

### Collection

15. A correct answer at any stage catches the entry in the aircraft collection, same as the standard quiz.

### Pack format changes

All optional.

| Field | Where | Type | Notes |
|-------|-------|------|-------|
| `reveal.style` | Question | `"crop"` or `"outline"` | Force a style for this question. |
| `reveal.focus` | Question | `{ x, y }` (0 to 1) | Center of the starting crop, as a fraction of image width and height. |
| `outline` | Question | string | Pre-made outline image. Without it, the app generates one (see Open questions). |

## Open questions

1. **Generating outlines from photos.** Edge detection on a photo also outlines clouds, ground, and other clutter. The SVG airliners can get a clean outline easily. Photo packs may need pre-made outline images, which could share the cutout work done for collection silhouettes.
2. **Random crops.** Without a set focus point, a random crop may show only sky. Either require `reveal.focus` on every question, or limit random crops to the middle of the image.
3. **Options per stage.** Should the number of buttons stay at 4 throughout, or start with more (say 6) and drop wrong ones as the image reveals?
4. Questions 7 to 14 from the thread (mode, styles, input, reveal trigger, scoring, collection, platform, file split) are using the defaults above until confirmed.
