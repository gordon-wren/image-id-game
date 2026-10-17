#!/usr/bin/env node
// Gathers what a review page needs for a list of candidate aircraft: Wikipedia
// description, first-flight and service-entry years, and a photo, preferring
// public domain. Writes review.json and 480px thumbnails to <out dir>; it never
// touches the dataset. See docs/aircraft-review.md.
//
// Usage: node scripts/aircraft-review/fetch.mjs <candidates.json> <out dir>
//
// candidates.json: [{ "id", "title" (Wikipedia article), "category", "engine" }]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const [candidatesPath, outDir] = process.argv.slice(2);
if (!candidatesPath || !outDir) {
  console.error("Usage: node scripts/aircraft-review/fetch.mjs <candidates.json> <out dir>");
  process.exit(1);
}

const UA = "image-id-game-dataset-builder/1.0 (https://github.com/gordon-wren/image-id-game)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The infobox image is usually right, so only skip obvious non-photos there; its
// filename can mention engines, cockpits and so on.
const NOT_A_LEAD = /\.(svg|gif|tiff?)$|logo|flag|\bmap\b|diagram|drawing|3[- ]?view|silhouette|insignia|roundel|emblem|\bseal\b|icon/i;
// Further down the article, be stricter.
const NOT_A_PHOTO = /\.(svg|gif|tiff?)$|logo|flag|map|diagram|drawing|3[- ]?view|silhouette|cockpit|instrument|engine|insignia|roundel|emblem|seal|icon|patch|crest|badge|interior|cabin|poster|stamp|model/i;
const PD = /^(public domain|pd\b|cc0)/i;
const USABLE = /^(cc0|cc[ -]by(-sa)?\b|public domain|pd\b|attribution|copyrighted free use|ogl)/i;

async function get(url, json = true) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (r.ok) return json ? r.json() : Buffer.from(await r.arrayBuffer());
    if (r.status === 404) return null;
    await sleep(2000 * (i + 1));
  }
  throw new Error(`failed: ${url}`);
}
const wp = (params) => get("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params }));
const strip = (s) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

const labelCache = new Map();
async function wikidataLabels(ids) {
  const missing = ids.filter((id) => !labelCache.has(id));
  if (missing.length) {
    const r = await get("https://www.wikidata.org/w/api.php?" + new URLSearchParams({ action: "wbgetentities", ids: missing.join("|"), props: "labels", format: "json" }));
    for (const id of missing) {
      const l = r?.entities?.[id]?.labels ?? {};
      labelCache.set(id, (l.en ?? l.mul ?? Object.values(l)[0])?.value ?? id);
    }
  }
  return ids.map((id) => labelCache.get(id));
}
const claimValues = (e, p) => (e?.claims?.[p] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue).map((c) => c.mainsnak.datavalue.value);
const wikidataYear = (e, p) => {
  const t = claimValues(e, p).map((v) => v.time).filter(Boolean).sort()[0];
  return t ? Number(t.slice(1, 5)) : null;
};
/** A year from an infobox row such as "Introduction" when Wikidata has none. */
function infoboxYear(box, labels) {
  for (const [, k, v] of box.matchAll(/<th[^>]*infobox-label[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*infobox-data[^>]*>([\s\S]*?)<\/td>/gi)) {
    if (labels.includes(strip(k).toLowerCase())) {
      const m = strip(v).match(/\b(1[89]\d\d|20\d\d)\b/);
      if (m) return Number(m[1]);
    }
  }
  return null;
}

async function photo(file) {
  const r = await wp({ action: "query", titles: `File:${file}`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "480" });
  const ii = r?.query?.pages?.[0]?.imageinfo?.[0];
  if (!ii) return null;
  const m = Object.fromEntries(Object.entries(ii.extmetadata ?? {}).map(([k, v]) => [k, v?.value]));
  let license = strip(m.LicenseShortName) || null;
  if (!license || /^gfdl/i.test(license)) {
    const cc = String(m.Categories ?? "").match(/(?:^|\|)CC-(BY(?:-SA)?)-([\d.]+)/i);
    if (cc) license = `CC ${cc[1].toUpperCase()} ${cc[2]}`;
  }
  let author = strip(m.Artist) || null;
  if (author && /^Q\d+$/.test(author)) author = (await wikidataLabels([author]))[0];
  return {
    file: `File:${file}`, sourcePage: ii.descriptionurl, thumbUrl: ii.thumburl, width: ii.width, height: ii.height,
    license, author, pd: Boolean(license && PD.test(license)), usable: Boolean(license && USABLE.test(license) && !m.NonFree),
  };
}

async function one({ id, title, category, engine }) {
  const s = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  if (!s) return { id, name: title, error: "no Wikipedia article with that title" };
  let entity = null;
  if (s.wikibase_item) {
    const ent = await get(`https://www.wikidata.org/wiki/Special:EntityData/${s.wikibase_item}.json`);
    entity = ent?.entities ? Object.values(ent.entities)[0] : null;
  }
  const country = entity ? await wikidataLabels(claimValues(entity, "P495").map((v) => v.id)) : [];
  const parse = await wp({ action: "parse", page: s.title, prop: "text", section: "0", redirects: "1" });
  const html = parse?.parse?.text ?? "";
  const box = html.slice(Math.max(0, html.search(/<table[^>]*class="[^"]*\binfobox\b/))).slice(0, 20000);
  const leadFile = [...box.matchAll(/href="\/wiki\/File:([^"#?]+)"/g)].map((m) => decodeURIComponent(m[1]).replace(/_/g, " ")).find((f) => !NOT_A_LEAD.test(f));
  const lead = leadFile ? await photo(leadFile) : null;

  // Prefer public domain: if the lead photo isn't, look further down the article.
  let chosen = lead?.pd ? lead : null;
  let src = "Wikipedia lead photo";
  if (!chosen) {
    const all = await wp({ action: "parse", page: s.title, prop: "images", redirects: "1" });
    const files = (all?.parse?.images ?? []).map((f) => f.replace(/_/g, " "))
      .filter((f) => f !== leadFile && /\.(jpe?g|png)$/i.test(f) && !NOT_A_PHOTO.test(f)).slice(0, 10);
    for (const f of files) {
      const p = await photo(f);
      await sleep(120);
      if (p?.pd && p.width >= 800 && p.width / p.height > 1.1) { chosen = p; break; }
    }
    if (chosen) src = `Public-domain photo from the article (the lead photo is ${lead?.license ?? "missing"})`;
    else if (lead?.usable) { chosen = lead; src = "Wikipedia lead photo (no public-domain alternative found)"; }
  }
  return {
    id, name: s.title, description: s.description ?? null, category, engine, country,
    firstFlight: wikidataYear(entity, "P606") ?? infoboxYear(box, ["first flight"]),
    introduced: wikidataYear(entity, "P729") ?? infoboxYear(box, ["introduction", "introduced", "introduction date"]),
    introducedByHand: false,
    inService: true,
    wikipedia: `https://en.wikipedia.org/wiki/${encodeURIComponent(s.title.replace(/ /g, "_"))}`,
    photo: chosen && { file: chosen.file, license: chosen.license, author: chosen.author, sourcePage: chosen.sourcePage, thumbUrl: chosen.thumbUrl, src },
    note: null,
  };
}

const candidates = JSON.parse(await readFile(candidatesPath, "utf8"));
await mkdir(join(outDir, "thumbs"), { recursive: true });
const out = [];
for (const c of candidates) {
  try {
    const r = await one(c);
    if (r.photo?.thumbUrl) {
      await writeFile(join(outDir, "thumbs", `${r.id}.jpg`), await get(r.photo.thumbUrl, false));
      r.thumb = `thumbs/${r.id}.jpg`;
    }
    out.push(r);
    const flags = [r.error, !r.photo && "NO PHOTO", r.photo && !/^(public domain|cc0)/i.test(r.photo.license ?? "") && `not PD: ${r.photo.license}`, !r.introduced && "no service year"].filter(Boolean);
    console.log(`${r.id.padEnd(22)} ${String(r.introduced ?? "?").padEnd(5)} ${flags.join(" | ")}`);
  } catch (e) {
    out.push({ id: c.id, name: c.title, error: e.message });
    console.log(`${c.id.padEnd(22)} ERROR ${e.message}`);
  }
  await sleep(250);
}
await writeFile(join(outDir, "review.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`\nWrote ${out.length} candidates to ${join(outDir, "review.json")}. Check every photo before building the page.`);
