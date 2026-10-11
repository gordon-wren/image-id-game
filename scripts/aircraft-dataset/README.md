# Aircraft dataset

Builds a reference dataset of aircraft types from English Wikipedia: basic facts
plus each article's lead ("title") photo, with its license and author.

- **List of aircraft:** [`seed.json`](seed.json) — `id`, Wikipedia article title, `group`,
  and optional fields (below).
- **Quizzes built from it:** [`scripts/packs/`](../packs/) — `npm run packs`.
- **Output data:** [`public/data/aircraft.json`](../../public/data/aircraft.json), described by
  [`public/data/aircraft.schema.json`](../../public/data/aircraft.schema.json).
- **Output photos:** `public/assets/aircraft/<id>.jpg`, 960px wide. Only licenses a credit line
  satisfies (public domain, CC0, CC BY, CC BY-SA, OGL…); GFDL-only photos are skipped.
- **Gaps from the last run:** [`REPORT.md`](REPORT.md).

## Where each field comes from

| Field | Source |
|---|---|
| `name`, `description`, `summary`, `wikidataId` | Wikipedia page summary |
| `label` | seed.json `label`, else `name` |
| `role`, `designer`, `status` | Wikipedia infobox (`type` / `role`) |
| `manufacturer`, `countryOfOrigin`, `firstFlight`, `introduced`, `numberBuilt` | Wikidata (P176, P495, P606, P729, P1092), falling back to the infobox |
| `photo` | seed.json `photo` if set; otherwise the first infobox image that isn't a logo or drawing, then Wikipedia's preview image, then photos further down the article. `photo.chosenFrom` says which. License and author from Commons metadata |

## Rebuilding

```bash
node scripts/aircraft-dataset/build.mjs                 # everything
node scripts/aircraft-dataset/build.mjs --only b747,a380 # some entries
node scripts/aircraft-dataset/build.mjs --skip-images    # metadata only
```

It needs network access to `en.wikipedia.org`, `www.wikidata.org` and
`upload.wikimedia.org`. Without that, run the **Build aircraft dataset**
workflow from the Actions tab (manual only); it rebuilds and commits the result
to the branch it ran on. Run `npm run packs` afterwards so the quizzes pick up
the changes.

To add an aircraft, append an entry to `seed.json` and rebuild. Optional fields:

| Field | Use |
|---|---|
| `label` | Short name for answer buttons when the article title reads badly, e.g. `"Airbus A320"` for "Airbus A320 family". |
| `photo` | A Commons file to use instead of picking one, e.g. `"File:S7 Il-86.jpg"`. Use it when the automatic pick is wrong, or has the type's name painted on it. |
| `wikidataId` | Take facts from this Wikidata item, for aircraft that share an article (the Ka-52 redirects to the Ka-50). |
| `overrides` | Facts the sources lack, e.g. `{"countryOfOrigin": ["Austria"]}`; listed in the record's `overridden`. |
| `packAnswerIds` | Answer ids in hand-written packs that this entry covers. |

Photos already downloaded are kept unless the chosen file changes. When a
photo comes from further down the article, `REPORT.md` lists it under "Check
these photos by eye": those are often prototypes, variants or details, so
look at them and pin a better one with `photo` if needed.

## Licensing

Wikipedia text (`summary`, `description`) is CC BY-SA 4.0. Every photo has its own
license in `photo.license`; use `photo.credit` as the attribution line wherever the
photo is shown.
