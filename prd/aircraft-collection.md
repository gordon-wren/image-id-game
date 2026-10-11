# Aircraft collection (dex)

**Status:** Draft
**Owner:** Gordon
**Last updated:** 2026-10-11

## Summary

A Pokédex-style collection of every aircraft in the game. Each entry starts as a dark silhouette. The first time the player answers that aircraft correctly, its slot is "caught": the real image fills in and its detail card unlocks. The collection shows how much of each pack the player has caught.

## Goals

- Give players a long-term reason to come back beyond high scores.
- Make progress visible: which aircraft are known and which are still missing.
- Turn each correct answer into a small reward moment.
- Teach something about each aircraft once it is caught.

## Non-goals

- Accounts, login, or cloud sync. Storage is local only, but the design must allow sync later (see Storage).
- Trading, sharing, or leaderboards.
- Rarity tiers, badges, or achievements beyond per-pack completion percentage.
- An iPhone app. The web app must work well on phone screens.

## Definitions

- **Entry:** one aircraft in the collection, identified by the pack id plus the question's `answer` id (for example `fighter-jets/f22`).
- **Caught:** the player has answered that entry correctly at least once, in any mode, timed out or not.
- **Uncaught:** never answered correctly.

## Requirements

### Catching

1. Any correct answer catches the entry, regardless of time taken or points earned.
2. Catching happens the moment the answer is confirmed correct, not at the end of the round, so quitting mid-round keeps the catch.
3. A wrong answer or a timeout never un-catches an entry.
4. The first catch of an entry shows a short "New catch!" moment in the result banner (for example a badge and the entry number). Repeat catches show nothing extra.
5. The end-of-round summary lists the new catches from that round, with a link to the collection.
6. Catches from any game mode count, including the planned partial reveal mode and the flashcard study mode if it records a correct answer. Study mode where no answer is given does not catch.

### Collection screen

7. There is one collection for all of Aviation, reachable from the category menu and from the round summary.
8. The collection is sectioned by pack (Large airliners, Fighter jets, Helicopters), in the same order as the pack picker.
9. Each section header shows the pack title, caught count, total, and percentage, for example "Fighter jets 12/20 (60%)", plus a progress bar in the pack's accent color.
10. The top of the screen shows the overall total across all packs.
11. Each entry has a fixed number within its pack (for example #007), taken from its position in the pack file so numbers don't change when questions shuffle.
12. Entries display as a grid of cards that works on a phone (at least 3 columns at 375px wide).
13. **Uncaught card:** the aircraft's silhouette (solid dark shape, no detail), the entry number, and "???" in place of the name. It is not tappable, or opens a locked state that shows only the silhouette.
14. **Caught card:** the real image, the entry number, and the aircraft name. Tapping opens the detail card.
15. A filter lets the player show All, Caught, or Missing.
16. A newly caught entry is highlighted the next time the collection opens (for example a "New" tag) until viewed.

### Detail card

17. Shows the image, name, pack, entry number, and the date first caught.
18. Shows these optional fields when the pack provides them: manufacturer, role (e.g. air superiority fighter), first flight year, country of origin, and a one or two sentence fun fact.
19. Shows the image credit when the question has one.
20. Missing optional fields are hidden, not shown as blanks.
21. Shows simple stats for that entry: times seen and times answered correctly.

### Silhouettes

22. The silhouette must reveal shape only: no colors, markings, livery, or background detail that would give the answer away.
23. Packs may provide an explicit silhouette image per entry. If none is given, the app falls back to a generated treatment of the main image (for example a CSS filter that turns it solid dark).
24. The fallback must still look like a silhouette for the current assets. The large airliners pack uses SVG drawings, which work well with a filter. The fighter and helicopter packs use photos with backgrounds, where a filter would produce a dark rectangle. These packs need authored silhouette images, or a cutout step, before this ships (see Open questions).

### Storage

25. Progress is stored in the browser (`localStorage`), like high scores today.
26. Storage is one versioned record, not one key per entry, so it can be exported or synced as a whole later. Suggested shape:

    ```json
    {
      "version": 1,
      "entries": {
        "fighter-jets/f22": {
          "firstCaughtAt": "2026-10-11T19:20:00Z",
          "seen": 4,
          "correct": 2,
          "viewed": true
        }
      },
      "updatedAt": "2026-10-11T19:20:00Z"
    }
    ```

27. All reads and writes go through one engine module (in `src/engine/`, no React), so a sync backend can replace local storage later without touching the UI.
28. Merging two records (for future sync) must be possible without losing catches: keep the earliest `firstCaughtAt`, add up counts, and treat caught as permanent.
29. If storage is unavailable (private browsing) the game still works; the collection simply doesn't persist.
30. Entries whose pack or answer id no longer exists are kept in storage but not shown, so renaming or removing a question doesn't destroy data.
31. A "Reset collection" control in settings, with a confirmation step.

### Pack format changes

All additions are optional so existing packs keep working.

| Field | Where | Type | Notes |
|-------|-------|------|-------|
| `silhouette` | Question | string | Path relative to `assetBase`, or absolute URL. Used for uncaught cards. |
| `info.manufacturer` | Question | string | e.g. "Lockheed Martin" |
| `info.role` | Question | string | e.g. "Air superiority fighter" |
| `info.firstFlight` | Question | number | Year |
| `info.country` | Question | string | Country of origin |
| `info.fact` | Question | string | One or two sentences |

The entry name comes from the label of the correct option, as it does today. `SCHEMA.md` and `types.ts` need updating to match.

## Success measures

Local only, so these are things to check by hand or with a later analytics feature:

- Players open the collection after a round.
- Players replay packs to fill missing entries.
- Completion percentage climbs across sessions.

## Open questions

1. **Silhouettes for photo packs.** Hand-author silhouette images for the 40 fighter and helicopter entries, generate them once with a background-removal tool and commit them, or show a heavy blur instead of a true silhouette for photo-based entries?
2. **Should the dex cover future categories?** This PRD scopes to Aviation. If an "Auto" category is added later, does it get its own collection tab?
3. **Where do the detail facts come from?** Writing 60 entries of facts is content work. Ship with facts for some packs and fill in the rest later?
4. **Pack completion moment.** Should reaching 100% on a pack trigger a special celebration, or is the percentage enough?
