# Commons photos

Fetches freely licensed photos from Wikimedia Commons for packs, with the
attribution each license needs.

- **Input:** [`manifest.json`](manifest.json) — per pack, each answer `id`, its `label` and a
  Commons `search`. Search ranking shifts between runs, so once you've chosen a
  photo pin it with `"file": "File:Name.jpg"` (`"pick": N` takes the Nth usable
  result of the current run).
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
Without that, open a pull request that changes `manifest.json`: the **Fetch
Commons photos** workflow runs the script and commits the result to the PR's
branch, so the photos are reviewed with it. It doesn't run on `main`, which only
accepts changes through a PR.

Only licenses a credit line satisfies are accepted (public domain, CC0, CC BY,
CC BY-SA, OGL); GFDL-only files are skipped. Create an empty
`scripts/commons-photos/PREVIEWS` file to have it save previews too, and delete
it (and `candidates/`) once you've chosen.
