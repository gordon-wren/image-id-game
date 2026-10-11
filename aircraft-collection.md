# Aircraft collection (dex)

**Status:** Draft
**Owner:** Gordon
**Last updated:** 2026-10-11

## Summary

A Pokédex-style collection of every aircraft in the game. Each entry starts as a name with no photo. The first time the player answers that aircraft correctly, its slot is "caught": the photo fills in and its detail card unlocks. The collection shows how much of each pack the player has caught.

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

- **Entry:** one aircraft in the collection. An aircraft that appears in several packs is one entry (the F-16 is in both Fighter Jets and Cold War Military Jets). Its key is the aircraft dataset id when the question's `answer` is a dataset aircraft (for example `f16`), and `<pack id>/<answer id>` otherwise (for example `large-airliners/b777-300er`, a variant the dataset doesn't split out). Packs are views onto the one collection.
- **Caught:** the player has answered that entry correctly at least once, in any pack, regardless of time taken.
- **Uncaught:** never answered correctly.
- **Seen:** the entry was shown as a question and the round ended (answered or timed out). Appearing as a wrong option doesn't count.

## Requirements

### Catching

1. Any correct answer catches the entry, regardless of time taken or points earned. This is deliberately easy: a lucky guess among four options, or a round with the timer off, still catches. The collection rewards playing, not mastery.
2. Catching happens the moment the answer is confirmed correct, not at the end of the round, so quitting mid-round keeps the catch.
3. A wrong answer or a timeout never un-catches an entry.
4. The first catch of an entry shows a short "New catch!" moment in the result banner (for example a badge and the entry number). Repeat catches show nothing extra.
5. The end-of-round summary lists the new catches from that round, with a link to the collection.
6. Catches count from the game in either answer mode (choices or typed), and from the planned partial reveal mode. Flashcard study mode never catches: "Got it" is the player's own judgement, not a checked answer, so counting it would let anyone fill the collection by tapping.

### Collection screen

7. There is one collection for all of Aviation, reachable from a **Collection** pill in the top bar of the menu and from the round summary.
8. The collection is sectioned by pack, in the same order as the menu (`public/packs/index.json`). An entry appears in every pack section that contains it, and catching it counts in all of them.
9. Each section header shows the pack title, caught count, total, and percentage, for example "Fighter jets 12/29 (41%)", plus a progress bar in the pack's accent color.
10. The top of the screen shows the overall total, counting each aircraft once.
11. Each entry has a permanent number (for example #042) that never changes once assigned, even when packs are regenerated or reordered. Numbers come from a generated registry (see Data) that only ever appends.
12. Entries display as a grid of cards that works on a phone (at least 3 columns at 375px wide). Photos load lazily, since the full set is about 20 MB.
13. **Uncaught card:** the entry number and the aircraft name on a plain placeholder in the pack's accent color, with no photo. Tapping opens a locked state showing the name and "Not caught yet", with no photo or facts.
14. **Caught card:** the real image, the entry number, and the aircraft name. Tapping opens the detail card.
15. A filter lets the player show All, Caught, or Missing.
16. A newly caught entry is highlighted the next time the collection opens (for example a "New" tag) until its detail card is opened.

### Detail card

17. Shows the image, name, entry number, the packs it appears in, and the date first caught.
18. Shows these facts when the aircraft dataset has them: a one-line description, role (e.g. air superiority fighter), manufacturer, first flight year, country of origin, and a short "About" (the first one or two sentences of the Wikipedia summary).
19. Text from Wikipedia carries a "From Wikipedia" link to the source article, as its CC BY-SA license requires.
20. Shows the image credit.
21. Missing fields are hidden, not shown as blanks. Entries that aren't in the dataset (variants, some medical types) show only the name, image, credit and the question's caption if it has one.
22. Shows simple stats for that entry: times seen and times answered correctly.

### Uncaught entries

23. Uncaught entries never show the photo, in the grid or anywhere else in the collection. The photo is the reward for catching it.
24. The name is shown, so the collection doubles as a checklist of what's still missing. There are no silhouettes or other derived images, so no new assets are needed.
25. Since names are visible, the Missing filter (req 15) works as a study list.

### Storage

26. Progress is stored in the browser (`localStorage`), like high scores today.
27. Storage is one versioned record, not one key per entry, so it can be exported or synced as a whole later. Shape:

    ```json
    {
      "version": 1,
      "entries": {
        "f22": {
          "firstCaughtAt": "2026-10-11T19:20:00Z",
          "seen": 4,
          "correct": 2,
          "viewed": true
        }
      },
      "updatedAt": "2026-10-11T19:20:00Z"
    }
    ```

28. All reads and writes go through one engine module (in `src/engine/`, no React), so a sync backend can replace local storage later without touching the UI.
29. Merging two records (for future sync) must never lose catches and must give the same result however many times it runs: keep the earliest `firstCaughtAt`, take the larger of each count, and treat caught and viewed as permanent. (Adding counts would double them every time the same records were merged again.)
30. If storage is unavailable (private browsing) the game still works; the collection simply doesn't persist.
31. Entries whose key no longer exists are kept in storage but not shown, so renaming or removing a question doesn't destroy data.
32. A "Reset collection" control on the collection screen, with a confirmation step.

### Data

No pack format changes. `npm run packs` (which already builds the aircraft packs) also writes `public/data/collection.json`, a small catalog the app loads at startup:

- every entry key with its permanent number, name, image and credit;
- the facts from req 18 for dataset aircraft (the full `aircraft.json` is about 430 KB, too much to load on every visit);
- a map from each `<pack id>/<answer id>` to its entry key, so the app never re-derives keys itself.

Existing numbers are read back from the previous `collection.json`, and new entries get the next numbers. `packs.test.mjs` fails if the catalog is out of date.

## Success measures

Local only, so these are things to check by hand or with a later analytics feature:

- Players open the collection after a round.
- Players replay packs to fill missing entries.
- Completion percentage climbs across sessions.

## Follow-ups

- Small thumbnails (about 240px) generated at build time for the grid, if lazy loading full photos is too slow on phones.

## Open questions

1. ~~**Silhouettes for photo packs.**~~ Decided: no silhouettes. Uncaught entries show the name only, with no photo (see Uncaught entries).
2. ~~**Should the dex cover future categories?**~~ Decided: the collection is keyed by the aircraft dataset, so it is Aviation's. Another category (e.g. Auto) would get its own dataset and its own collection tab.
3. ~~**Where do the detail facts come from?**~~ Decided: the aircraft dataset (req 18). Only the ~25 entries outside it lack facts.
4. **Pack completion moment.** Should reaching 100% on a pack trigger a special celebration, or is the percentage enough? Recommendation: a small one, since it's cheap and a natural reward moment.
