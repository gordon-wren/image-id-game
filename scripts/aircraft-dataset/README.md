# Aircraft dataset

Builds a reference dataset of aircraft types from English Wikipedia: basic facts
plus each article's lead ("title") photo, with its license and author.

- **List of aircraft:** [`seed.json`](seed.json) — `id`, Wikipedia article title, `group`,
  and optional `packAnswerIds` linking to answer ids already used in `public/packs/`.
- **Output data:** [`public/data/aircraft.json`](../../public/data/aircraft.json), described by
  [`public/data/aircraft.schema.json`](../../public/data/aircraft.schema.json).
- **Output photos:** `public/assets/aircraft/<id>.jpg`, 960px wide, free licenses only.
- **Gaps from the last run:** [`REPORT.md`](REPORT.md).

## Where each field comes from

| Field | Source |
|---|---|
| `name`, `description`, `summary`, `wikidataId` | Wikipedia page summary |
| `role`, `designer`, `status` | Wikipedia infobox (`type` / `role`) |
| `manufacturer`, `countryOfOrigin`, `firstFlight`, `introduced`, `numberBuilt` | Wikidata (P176, P495, P606, P729, P1092), falling back to the infobox |
| `photo` | Infobox image, or Wikipedia's free page image if that one isn't freely licensed; license and author from Commons metadata |

## Rebuilding

```bash
node scripts/aircraft-dataset/build.mjs                 # everything
node scripts/aircraft-dataset/build.mjs --only b747,a380 # some entries
node scripts/aircraft-dataset/build.mjs --skip-images    # metadata only
```

It needs network access to `en.wikipedia.org`, `www.wikidata.org` and
`upload.wikimedia.org`. Without that, run the **Build aircraft dataset**
workflow from the Actions tab; it rebuilds and commits the result to the branch
it ran on.

To add an aircraft, append an entry to `seed.json` and rebuild. An entry can carry
`overrides` (e.g. `{"countryOfOrigin": ["Austria"]}`) for facts the sources lack;
those fields are listed in the record's `overridden`. Photos already
downloaded are kept unless the article's lead image changes.

## Licensing

Wikipedia text (`summary`, `description`) is CC BY-SA 4.0. Every photo has its own
license in `photo.license`; use `photo.credit` as the attribution line wherever the
photo is shown.
