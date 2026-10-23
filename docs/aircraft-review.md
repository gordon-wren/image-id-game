# Reviewing new aircraft before they join the dataset

New aircraft go through a review page before they are added to
`public/data/aircraft.json`. The page shows every candidate with its photo,
years, role and license, and the reviewer approves or skips each one. Nothing
changes in the repo until the review is done.

The first round (US military aircraft, WWI to today, 116 types) used this
process. Its candidate list is `scripts/aircraft-review/candidates/us.json`.

## The steps

| Step | What happens | Tool |
|---|---|---|
| 1. Candidates | List the aircraft to propose, with role and engine | `candidates/<country>.json` |
| 2. Fetch | Get years, description and a photo for each, preferring public domain | `fetch.mjs` |
| 3. Vet | Look at every photo and fix weak ones; fill gaps by hand | `find-photo.mjs`, edit `review.json` |
| 4. Page | Build the review page and publish it | `page.mjs`, Artifact |
| 5. Decide | The reviewer approves or skips; decisions are read back | the page, `ArtifactData` |
| 6. Apply | Add approved aircraft to the seed and rebuild | `apply.mjs`, `build.mjs`, `npm run packs` |

Work in a folder **outside the repo** for steps 2–5 (photos and drafts never
need committing). Avoid `/tmp` for anything you want to keep for more than a day
or two: macOS clears old files there, and the first round lost its contact-sheet
tooling midway that way.

### 1. Candidates

Write `scripts/aircraft-review/candidates/<country>.json`:

```json
[
  { "id": "p47", "title": "Republic P-47 Thunderbolt", "category": "fighter", "engine": "piston" }
]
```

- `id`: short and unique across the whole seed. Check it isn't taken: `f100`
  was already the Fokker 100, so the F-100 became `f100-super-sabre`.
  `apply.mjs` refuses clashes.
- `title`: the exact English Wikipedia article title. Redirects work, but a
  wrong title fails (the HH-3 is under "Sikorsky S-61R").
- `category` and `engine`: see [Attributes](#attributes).

Skip types that duplicate another entry or share its photo. The Boeing F4B was
left out because it is the Navy version of the P-12 and Wikipedia uses the same
photo for both.

### 2. Fetch

```bash
node scripts/aircraft-review/fetch.mjs scripts/aircraft-review/candidates/us.json ~/review-us
```

It writes `~/review-us/review.json` and `~/review-us/thumbs/<id>.jpg`, and
prints any gaps. For each aircraft it:

- reads the description, first flight (Wikidata P606) and service entry
  (P729), falling back to the article's infobox;
- takes the infobox photo if it is public domain or CC0, otherwise searches the
  article for a public-domain photo, otherwise keeps the infobox photo if its
  license is usable (CC BY, CC BY-SA). GFDL-only photos are never used: the GFDL
  needs its full text shipped with the image.

### 3. Vet every photo

Look at every thumbnail. The review page itself works as a contact sheet:
build it (step 4) and open `index.html` locally. Replace a photo that:

- shows the wrong aircraft, a prototype or a different variant (the V-22's
  fallback was the XV-15);
- is mostly something else: crew posing, a cockpit, a factory floor, a
  maintenance hangar, a night gun-firing shot;
- names the type in text: a house livery ("A320" on the tail), a banner, a
  placard. That gives the answer away in the quiz;
- is a logo, drawing, stamp or tiny speck in the distance.

Find a replacement:

```bash
node scripts/aircraft-review/find-photo.mjs ~/review-us/alt p47 '"P-47" Thunderbolt in flight'
```

Then edit the entry in `review.json`: set `photo.file` to the chosen
`File:…` name, `photo.license`, `photo.sourcePage`, and `photo.src` to say where
it came from, and copy the preview over `thumbs/<id>.jpg`.

Other hand edits in `review.json`, all shown on the page:

| Field | When |
|---|---|
| `introduced` + `"introducedByHand": true` | Wikidata and the infobox have no service year. Shown as "by hand" so the reviewer checks it |
| `firstFlight` + `"firstFlightByHand": true` | Wikidata's first flight is wrong (the Il-38's was after its service entry) |
| `photoAuthor` | Commons leaves the author blank (US military photos, some "own work" uploads); also set `photo.author` so the page shows it |
| `"inService": false` | Flying but not operational yet (T-7, MQ-25); grouped separately |
| `note` | Anything the reviewer should know ("Photo shows a Canadian-registered DH-4") |
| `label` | Button name when the article title reads badly (`"Sikorsky HH-3 (S-61R)"`) |
| `"dropped": "<reason>"` | Left out; listed at the bottom of the page with the reason |

### 4. Build and publish the page

```bash
node scripts/aircraft-review/page.mjs ~/review-us "US Military Aircraft Review" \
  "US military aircraft, WWI to today" "United States"
```

This writes `~/review-us/index.html`. Publish it as an Artifact from Claude
Code with the thumbnails as files and the `db` capability, so decisions are
saved where Claude can read them:

- `file_path`: `~/review-us/index.html`, `root`: `~/review-us`
- `files`: every `thumbs/<id>.jpg` (up to 255 per publish)
- `capabilities`: `{"db": {}}`
- `icon`: `checklist`

Without `db` (for example, opened outside claude.ai), the page still works:
decisions are kept in that browser, and **Copy decisions** produces text to
paste into the conversation.

### 5. Read the decisions

Each card's Approve / Skip / Note writes one document to the page's
`decisions` collection: `{ decision: "approve" | "skip", note?, at }`, keyed by
aircraft id. In Claude Code:

```
ArtifactData  action: list  collection: decisions  query: { limit: 1000 }
```

Undecided aircraft have no document. If the reviewer approves in conversation
instead ("approve all of them"), the collection stays empty; go by what they
said.

### 6. Apply

```bash
node scripts/aircraft-review/apply.mjs ~/review-us "United States"            # everything not dropped
node scripts/aircraft-review/apply.mjs ~/review-us "United States" p47,b25    # or only some
node scripts/aircraft-dataset/build.mjs --only <ids printed by apply.mjs>
npm run packs
npm test
```

`apply.mjs` appends each aircraft to `scripts/aircraft-dataset/seed.json` with
its reviewed photo pinned (`photo`), `use: "military"`, its category, engine and
`group`, any `photoAuthor`, and `overrides` for the country and any hand-filled
service year or first flight. It
always records the country, because Wikidata has none for many older types (21
of the first 116). For a joint project, edit the override afterwards, for example
the UH-72 is `["United States", "Germany"]`.

Then check:

- `scripts/aircraft-dataset/REPORT.md` lists remaining gaps. Missing first
  flights are acceptable; leave them empty rather than guess.
- `npm run packs` regenerates every generated pack and the collection catalog.
  Existing collection numbers never change; new aircraft get the next ones.
- Aircraft reach the game through the generated menu (`scripts/packs/taxonomy.json`):
  new aircraft join the era, decade, role and country sets they qualify for, and
  a new set appears once it has at least 5 aircraft. Types without a
  service-entry year (not yet in service) only join role and country sets.

## Attributes

Every aircraft carries three curated fields, set in `seed.json` and validated by
`public/data/aircraft.schema.json`. The menu definition in
`scripts/packs/taxonomy.json` can filter on all three.

| Field | Values |
|---|---|
| `use` | `military`, `civil` |
| `category` | `fighter`, `attack`, `bomber`, `transport`, `tanker`, `patrol`, `reconnaissance`, `airborne-early-warning`, `electronic-warfare`, `airborne-command`, `trainer`, `uav`, `attack-helicopter`, `utility-helicopter`, `cargo-helicopter`, plus civil `airliner`, `business`, `light`, `utility`, `experimental` |
| `engine` | `piston`, `jet`, `turboprop`, `turboshaft` (helicopters and tiltrotors) |

Optionally, `natoName` holds the NATO reporting name (`"Badger"` for the
Tu-16), shown on the answer card. `fetch.mjs` fills it from Wikidata (P561);
when Wikidata lists several, keep the name of the main production type.

The decade of an aircraft comes from `introduced` (service entry), not a
separate field.

`group` is an older, coarser field; the taxonomy still uses it to split civil
airliners into widebody, narrowbody and regional. `apply.mjs` sets it
from the attributes: helicopters → `helicopter`; trainers → `trainer`; piston
fighters, attack aircraft and bombers up to 1945 → `historic`; other fighters
and attack aircraft → `fighter-attack`; bombers → `bomber`; everything else →
`military-transport-special`.

## Notes for the next rounds

- **Public domain is mostly a US thing.** US federal works are public domain,
  which is why nearly every US photo was. Soviet, German and Japanese aircraft
  will lean on CC BY and CC BY-SA photos. Those are fine; credit them, and never
  use GFDL-only.
- **Check every card's photo against the article.** The automatic fallbacks pick
  plausible files, not good ones; about one in twenty needed replacing.
- **Hand-filled facts need a source you trust.** Mark them on the page so the
  reviewer can check them; don't fill in what you're unsure of.
