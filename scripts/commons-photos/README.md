# Commons photos

Fetches freely licensed photos from Wikimedia Commons for packs, with the
attribution each license needs.

- **Input:** [`manifest.json`](manifest.json) — per pack, each answer `id`, its `label` and a
  Commons `search`. Add `"pick": N` to take the Nth usable result, or
  `"file": "File:Name.jpg"` to pin one.
- **Output:** `public/assets/<pack>/<id>.jpg` and [`credits.json`](credits.json) (file, author,
  license, and a ready-made `credit` line to copy into the pack question).
- **Last run:** [`REPORT.md`](REPORT.md) lists the top candidates per entry.

Only JPEGs that are landscape, at least 1000px wide and under a free license are
considered.

```bash
node scripts/commons-photos/fetch.mjs                       # everything
node scripts/commons-photos/fetch.mjs --only medical-planes/pc12
node scripts/commons-photos/fetch.mjs --previews            # also save 320px previews to candidates/
```

It needs network access to `commons.wikimedia.org` and `upload.wikimedia.org`.
Without that, push a change to `manifest.json` on a branch: the **Fetch Commons
photos** workflow runs the script and commits the result. Create an empty
`scripts/commons-photos/PREVIEWS` file to have it save previews too, and delete
it (and `candidates/`) once you've chosen.
