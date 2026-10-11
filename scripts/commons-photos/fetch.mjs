// Finds a freely licensed Wikimedia Commons photo for each entry in manifest.json,
// downloads it to public/assets/<pack>/<id>.jpg and records its attribution in
// credits.json. An entry can pin a photo with "file": "File:Name.jpg", or take
// the Nth search candidate with "pick": N. Small previews of the top candidates
// go to candidates/ so a person can choose without browsing Commons.
//
//   node scripts/commons-photos/fetch.mjs [--previews] [--only pack/id,pack/id]

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const API = "https://commons.wikimedia.org/w/api.php";
const UA = "image-id-game/1.0 (https://github.com/gordon-wren/image-id-game)";
const WIDTH = 1200;
const PREVIEWS = 6;

const args = process.argv.slice(2);
const wantPreviews = args.includes("--previews");
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") ? new Set(onlyArg.split(",")) : null;

// Licenses a credit line satisfies. GFDL-only files are left out: the GFDL wants
// its full text shipped with the image.
const FREE = /^(CC0|CC BY(-SA)? \d|Public domain|PD|OGL|Attribution)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res;
    if (i >= tries || (res.status !== 429 && res.status < 500)) {
      throw new Error(`${res.status} ${url}`);
    }
    await sleep(2000 * 2 ** i);
  }
}

function stripHtml(s) {
  return (s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function describe(page) {
  const info = page.imageinfo?.[0];
  if (!info) return null;
  const m = info.extmetadata ?? {};
  const license = stripHtml(m.LicenseShortName?.value) || null;
  const author = stripHtml(m.Artist?.value) || stripHtml(m.Credit?.value) || "Unknown author";
  return {
    file: page.title,
    sourcePage: info.descriptionurl,
    thumbUrl: info.thumburl,
    mime: info.mime,
    width: info.width,
    height: info.height,
    author: author.length > 120 ? author.slice(0, 117) + "…" : author,
    license,
    licenseUrl: m.LicenseUrl?.value ?? null,
    free: Boolean(license && FREE.test(license) && m.NonFree?.value !== "true"),
    description: stripHtml(m.ImageDescription?.value).slice(0, 300) || null,
  };
}

async function query(params) {
  const qs = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(WIDTH),
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|NonFree|ImageDescription",
    ...params,
  });
  const res = await get(`${API}?${qs}`);
  return (await res.json()).query?.pages ?? [];
}

function usable(c) {
  return c && c.free && c.mime === "image/jpeg" && c.width >= 1000 && c.width >= c.height * 1.2;
}

async function candidates(entry) {
  const pages = await query({
    generator: "search",
    gsrsearch: `${entry.search} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: "40",
  });
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map(describe)
    .filter(usable);
}

async function main() {
  const manifest = JSON.parse(await readFile(join(here, "manifest.json"), "utf8"));
  const creditsPath = join(here, "credits.json");
  const credits = JSON.parse(await readFile(creditsPath, "utf8").catch(() => "{}"));
  const report = ["# Candidate photos", ""];
  const problems = [];

  for (const [pack, entries] of Object.entries(manifest.packs)) {
    credits[pack] ??= {};
    for (const entry of entries) {
      const key = `${pack}/${entry.id}`;
      if (only && !only.has(key)) continue;
      let list = [];
      let chosen;
      try {
        list = await candidates(entry);
        if (entry.file) {
          const [page] = await query({ titles: entry.file });
          chosen = describe(page);
          if (!chosen?.free) throw new Error(`${entry.file} is not freely licensed (${chosen?.license})`);
        } else {
          chosen = list[entry.pick ?? 0];
        }
      } catch (err) {
        problems.push(`${key}: ${err.message}`);
        continue;
      }
      if (!chosen) {
        problems.push(`${key}: no usable result for "${entry.search}"`);
        continue;
      }

      const out = join(root, "public", "assets", pack, `${entry.id}.jpg`);
      if (credits[pack][entry.id]?.file !== chosen.file) {
        await mkdir(dirname(out), { recursive: true });
        const img = await get(chosen.thumbUrl);
        await writeFile(out, Buffer.from(await img.arrayBuffer()));
      }
      const { thumbUrl, mime, free, ...kept } = chosen;
      credits[pack][entry.id] = {
        ...kept,
        credit: `${chosen.author} / ${chosen.license} / via Wikimedia Commons`,
      };

      report.push(`## ${key} — ${entry.label}`, "", `Search: \`${entry.search}\``, "");
      list.slice(0, PREVIEWS).forEach((c, i) => {
        const mark = c.file === chosen.file ? " **(chosen)**" : "";
        report.push(`${i}. ${c.file} — ${c.license}${mark}`);
      });
      if (!list.some((c) => c.file === chosen.file)) report.push(`- pinned: ${chosen.file}`);
      report.push("");

      if (wantPreviews) {
        const dir = join(here, "candidates", pack);
        await mkdir(dir, { recursive: true });
        for (const [i, c] of list.slice(0, PREVIEWS).entries()) {
          const small = c.thumbUrl.replace(`/${WIDTH}px-`, "/320px-");
          const img = await get(small);
          await writeFile(join(dir, `${entry.id}-${i}.jpg`), Buffer.from(await img.arrayBuffer()));
        }
      }
      await sleep(300);
    }
  }

  if (!wantPreviews) await rm(join(here, "candidates"), { recursive: true, force: true });
  await writeFile(creditsPath, JSON.stringify(credits, null, 2) + "\n");
  if (problems.length) report.push("# Problems", "", ...problems.map((p) => `- ${p}`), "");
  await writeFile(join(here, "REPORT.md"), report.join("\n"));
  console.log(problems.length ? problems.join("\n") : "All entries have a photo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
