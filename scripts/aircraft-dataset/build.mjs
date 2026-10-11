#!/usr/bin/env node
// Builds public/data/aircraft.json and public/assets/aircraft/*.jpg from the
// Wikipedia articles listed in seed.json.
//
// Sources, per aircraft:
//   - Wikipedia REST summary  -> name, short description, intro extract, Wikidata id
//   - Wikipedia pageimages    -> the article's lead ("title") photo, free images only
//   - Wikipedia infobox       -> role/type, manufacturer, origin, first flight (fallbacks)
//   - Wikidata                -> structured manufacturer, country, first flight, intro, number built
//   - Commons imageinfo       -> photo URL, license, author, attribution
//
// Usage:
//   node scripts/aircraft-dataset/build.mjs                # build everything
//   node scripts/aircraft-dataset/build.mjs --only b747,a380
//   node scripts/aircraft-dataset/build.mjs --skip-images  # metadata only
//
// Needs network access to en.wikipedia.org, www.wikidata.org,
// commons.wikimedia.org and upload.wikimedia.org.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const SEED = join(here, "seed.json");
const OUT_JSON = join(root, "public/data/aircraft.json");
const OUT_IMG_DIR = join(root, "public/assets/aircraft");
const IMG_PUBLIC_PREFIX = "assets/aircraft/";
const THUMB_WIDTH = 960;

const UA =
  "image-id-game-dataset-builder/1.0 (https://github.com/gordon-wren/image-id-game)";

const args = process.argv.slice(2);
const only = (() => {
  const i = args.indexOf("--only");
  return i >= 0 ? new Set(args[i + 1].split(",")) : null;
})();
const skipImages = args.includes("--skip-images");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = true, tries = 4 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    if (res.ok) return json ? res.json() : Buffer.from(await res.arrayBuffer());
    if (res.status === 404) return null;
    if (attempt >= tries || ![429, 500, 502, 503, 504].includes(res.status)) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    const retryAfter = Number(res.headers.get("retry-after")) || 2 ** attempt;
    await sleep(retryAfter * 1000);
  }
}

const wpApi = (params) =>
  get(
    "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({ format: "json", formatversion: "2", ...params }),
  );

// ---------------------------------------------------------------------------
// Wikitext helpers
// ---------------------------------------------------------------------------

function stripHtml(s) {
  return s
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses a date template like {{start date|1969|2|9}} into an ISO-ish string. */
function dateFromTemplate(s) {
  const m = s.match(
    /\{\{\s*(?:start[ _]date(?:[ _]and[ _]age)?|date|birth date)\s*\|(?:[a-z]+=[^|}]*\|)*\s*(\d{3,4})\s*(?:\|\s*(\d{1,2})\s*)?(?:\|\s*(\d{1,2})\s*)?/i,
  );
  if (!m) return null;
  const [, y, mo, d] = m;
  return [y.padStart(4, "0"), mo?.padStart(2, "0"), d?.padStart(2, "0")].filter(Boolean).join("-");
}

function cleanWikitext(s) {
  let t = s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
  // Unwrap list templates: {{ubl|a|b}}, {{plainlist|* a * b}}, {{hlist|a|b}}.
  t = t.replace(/\{\{\s*(?:ubl|unbulleted list|hlist|flatlist|plainlist|plain list)\s*\|([\s\S]*?)\}\}/gi, (_, inner) =>
    inner.split(/\||\n\s*\*/).map((x) => x.replace(/^\s*\*\s*/, "").trim()).filter(Boolean).join("; "),
  );
  // Date templates -> ISO.
  t = t.replace(/\{\{\s*(?:start[ _]date(?:[ _]and[ _]age)?|date)\s*\|[^{}]*\}\}/gi, (m) => dateFromTemplate(m) ?? "");
  // Drop remaining templates (flags, cite, nowrap content kept when simple).
  t = t.replace(/\{\{\s*nowrap\s*\|([^{}]*)\}\}/gi, "$1");
  for (let i = 0; i < 5; i++) t = t.replace(/\{\{[^{}]*\}\}/g, "");
  // Links.
  t = t.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1").replace(/\[https?:[^\s\]]+\s*([^\]]*)\]/g, "$1");
  t = t.replace(/'''?/g, "").replace(/^\s*\*\s*/gm, "").replace(/\n+/g, "; ");
  return stripHtml(t).replace(/^[;,\s]+|[;,\s]+$/g, "").replace(/(;\s*)+/g, "; ");
}

/** Pulls `| key = value` pairs out of the first {{Infobox aircraft ...}} block(s). */
function parseInfobox(wikitext) {
  const fields = {};
  const re = /\{\{\s*Infobox[ _]aircraft[^|]*/gi;
  let m;
  while ((m = re.exec(wikitext))) {
    // Walk to the matching closing braces.
    let depth = 0, i = m.index;
    for (; i < wikitext.length - 1; i++) {
      if (wikitext[i] === "{" && wikitext[i + 1] === "{") { depth++; i++; }
      else if (wikitext[i] === "}" && wikitext[i + 1] === "}") { depth--; i++; if (depth === 0) break; }
    }
    const body = wikitext.slice(m.index + m[0].length, i - 1);
    // Split on top-level pipes only.
    const parts = [];
    let d = 0, sq = 0, cur = "";
    for (let j = 0; j < body.length; j++) {
      const c = body[j], n = body[j + 1];
      if (c === "{" && n === "{") { d++; cur += "{{"; j++; continue; }
      if (c === "}" && n === "}") { d--; cur += "}}"; j++; continue; }
      if (c === "[" && n === "[") { sq++; cur += "[["; j++; continue; }
      if (c === "]" && n === "]") { sq--; cur += "]]"; j++; continue; }
      if (c === "|" && d === 0 && sq === 0) { parts.push(cur); cur = ""; continue; }
      cur += c;
    }
    parts.push(cur);
    for (const p of parts) {
      const eq = p.indexOf("=");
      if (eq < 0) continue;
      const key = p.slice(0, eq).trim().toLowerCase().replace(/_/g, " ");
      const raw = p.slice(eq + 1).trim();
      if (!key || !raw || fields[key]) continue;
      fields[key] = { raw, text: cleanWikitext(raw) };
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Wikidata helpers
// ---------------------------------------------------------------------------

const labelCache = new Map();

async function wikidataLabels(ids) {
  const missing = [...new Set(ids)].filter((id) => !labelCache.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    const batch = missing.slice(i, i + 50);
    const res = await get(
      "https://www.wikidata.org/w/api.php?" +
        new URLSearchParams({ action: "wbgetentities", ids: batch.join("|"), props: "labels", languages: "en", format: "json" }),
    );
    for (const id of batch) labelCache.set(id, res?.entities?.[id]?.labels?.en?.value ?? id);
  }
  return ids.map((id) => labelCache.get(id));
}

function claims(entity, prop) {
  const all = (entity?.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue);
  const preferred = all.filter((c) => c.rank === "preferred");
  return preferred.length ? preferred : all;
}

const itemIds = (entity, prop) => claims(entity, prop).map((c) => c.mainsnak.datavalue.value.id);

function wdTime(entity, prop) {
  const times = claims(entity, prop).map((c) => c.mainsnak.datavalue.value).filter((v) => v.time);
  if (!times.length) return null;
  times.sort((a, b) => a.time.localeCompare(b.time));
  const { time, precision } = times[0];
  const [, y, mo, d] = time.match(/^[+-](\d+)-(\d\d)-(\d\d)/);
  const year = y.replace(/^0+(?=\d{4})/, "");
  if (precision >= 11) return `${year}-${mo}-${d}`;
  if (precision === 10) return `${year}-${mo}`;
  return year;
}

function wdQuantity(entity, prop) {
  const q = claims(entity, prop)[0]?.mainsnak.datavalue.value;
  return q ? Number(q.amount) : null;
}

// ---------------------------------------------------------------------------
// Photo helpers
// ---------------------------------------------------------------------------

const FREE_LICENSE = /^(cc0|cc[ -]by|public domain|pd|gfdl|attribution|copyrighted free use|fal|free art)/i;

async function photoInfo(fileName) {
  const res = await wpApi({
    action: "query",
    titles: `File:${fileName}`,
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
  });
  const page = res?.query?.pages?.[0];
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  const meta = Object.fromEntries(Object.entries(ii.extmetadata ?? {}).map(([k, v]) => [k, v?.value]));
  const license = meta.LicenseShortName ? stripHtml(String(meta.LicenseShortName)) : null;
  const onCommons = page.imagerepository === "shared";
  const free = !meta.NonFree && (onCommons || (license && FREE_LICENSE.test(license)));
  const author = meta.Artist ? stripHtml(String(meta.Artist)) : null;
  return {
    sourceFile: `File:${fileName}`,
    sourcePage: ii.descriptionurl,
    originalUrl: ii.url,
    thumbUrl: ii.thumburl ?? ii.url,
    width: ii.thumbwidth ?? ii.width,
    height: ii.thumbheight ?? ii.height,
    originalWidth: ii.width,
    originalHeight: ii.height,
    mime: ii.mime,
    author,
    license,
    licenseUrl: meta.LicenseUrl ?? null,
    attributionRequired: meta.AttributionRequired ? meta.AttributionRequired === "true" : null,
    free,
    caption: meta.ImageDescription ? stripHtml(String(meta.ImageDescription)).slice(0, 300) : null,
    dateTaken: meta.DateTimeOriginal ? stripHtml(String(meta.DateTimeOriginal)) : null,
  };
}

const extFor = (mime) => ({ "image/png": "png", "image/webp": "webp", "image/gif": "gif" })[mime] ?? "jpg";

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function splitList(s) {
  return s ? s.split(/;\s*|\s+and\s+|,\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean) : [];
}

async function buildOne(seed, previous) {
  const titleKey = encodeURIComponent(seed.wikipediaTitle.replace(/ /g, "_"));
  const summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleKey}`);
  if (!summary) throw new Error(`no Wikipedia article "${seed.wikipediaTitle}"`);
  const title = summary.title;

  const [parse, pi] = await Promise.all([
    wpApi({ action: "parse", page: title, prop: "wikitext", section: "0", redirects: "1" }),
    wpApi({ action: "query", titles: title, prop: "pageimages|info|revisions", piprop: "name", pilicense: "free", rvprop: "ids|timestamp", redirects: "1" }),
  ]);
  const page = pi?.query?.pages?.[0] ?? {};
  const infobox = parseInfobox(parse?.parse?.wikitext ?? "");
  const ib = (k) => infobox[k]?.text || null;

  let wd = null;
  if (summary.wikibase_item) {
    const ent = await get(`https://www.wikidata.org/wiki/Special:EntityData/${summary.wikibase_item}.json`);
    wd = ent?.entities ? Object.values(ent.entities)[0] : null;
  }
  const [manufacturersWd, countriesWd, usesWd] = wd
    ? await Promise.all([itemIds(wd, "P176"), itemIds(wd, "P495"), itemIds(wd, "P366")].map(wikidataLabels))
    : [[], [], []];

  const firstFlightIb = infobox["first flight"] ? dateFromTemplate(infobox["first flight"].raw) ?? ib("first flight") : null;
  const introIb = infobox["introduction"] ? dateFromTemplate(infobox["introduction"].raw) ?? ib("introduction") : null;
  const numberBuiltIb = ib("number built");

  const record = {
    id: seed.id,
    name: title,
    group: seed.group,
    ...(seed.packAnswerIds ? { packAnswerIds: seed.packAnswerIds } : {}),
    description: summary.description ?? null,
    summary: summary.extract ?? null,
    role: ib("type") ?? ib("role") ?? (usesWd.length ? usesWd.join("; ") : null),
    manufacturer: manufacturersWd.length ? manufacturersWd : splitList(ib("manufacturer")),
    designer: ib("designer") ?? ib("designer group"),
    countryOfOrigin: countriesWd.length ? countriesWd : splitList(ib("national origin")),
    firstFlight: (wd && wdTime(wd, "P606")) ?? firstFlightIb,
    introduced: (wd && wdTime(wd, "P729")) ?? introIb,
    status: ib("status"),
    numberBuilt: (wd && wdQuantity(wd, "P1092")) ?? (numberBuiltIb && /^\d[\d,]*$/.test(numberBuiltIb) ? Number(numberBuiltIb.replace(/,/g, "")) : numberBuiltIb),
    wikipedia: {
      title,
      url: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${titleKey}`,
      pageId: page.pageid ?? summary.pageid ?? null,
      revisionId: page.revisions?.[0]?.revid ?? summary.revision ?? null,
    },
    wikidataId: summary.wikibase_item ?? null,
    photo: null,
    retrievedAt: new Date().toISOString(),
  };

  // The "title photo" is the infobox image; fall back to the page image Wikipedia
  // picks for previews (always a free image) when the infobox one is missing or non-free.
  const infoboxImage = infobox["image"]?.raw
    .replace(/^\[\[/, "").replace(/\|[\s\S]*$/, "").replace(/\]\]$/, "")
    .replace(/^(?:File|Image):/i, "").trim();
  let info = infoboxImage ? await photoInfo(infoboxImage) : null;
  if ((!info || !info.free) && page.pageimage && page.pageimage.replace(/_/g, " ") !== infoboxImage?.replace(/_/g, " ")) {
    info = (await photoInfo(page.pageimage)) ?? info;
  }
  if (info) {
    const ext = extFor(info.mime);
    const localName = `${seed.id}.${ext}`;
    const localPath = join(OUT_IMG_DIR, localName);
    const credit = [info.author ?? "Unknown author", info.license, /commons\.wikimedia/.test(info.sourcePage ?? "") ? "via Wikimedia Commons" : "via Wikipedia"].filter(Boolean).join(" / ");
    record.photo = { file: info.free ? IMG_PUBLIC_PREFIX + localName : null, ...info, credit };
    if (info.free && !skipImages) {
      const unchanged = previous?.photo?.sourceFile === info.sourceFile && (await exists(localPath));
      if (!unchanged) await writeFile(localPath, await get(info.thumbUrl, { json: false }));
    }
  }
  return record;
}

async function main() {
  const seed = JSON.parse(await readFile(SEED, "utf8"));
  await mkdir(dirname(OUT_JSON), { recursive: true });
  await mkdir(OUT_IMG_DIR, { recursive: true });

  let previous = [];
  try { previous = JSON.parse(await readFile(OUT_JSON, "utf8")).aircraft ?? []; } catch {}
  const prevById = new Map(previous.map((a) => [a.id, a]));

  const results = [];
  const problems = [];
  for (const s of seed) {
    if (only && !only.has(s.id)) {
      if (prevById.has(s.id)) results.push(prevById.get(s.id));
      continue;
    }
    try {
      const r = await buildOne(s, prevById.get(s.id));
      results.push(r);
      const missing = ["role", "firstFlight"].filter((k) => !r[k]);
      if (!r.manufacturer.length) missing.push("manufacturer");
      if (!r.countryOfOrigin.length) missing.push("countryOfOrigin");
      if (!r.photo) missing.push("photo");
      else if (!r.photo.free) missing.push("free photo");
      if (missing.length) problems.push(`${s.id}: missing ${missing.join(", ")}`);
      console.log(`ok   ${s.id.padEnd(16)} ${r.name}${missing.length ? `  (missing ${missing.join(", ")})` : ""}`);
    } catch (e) {
      problems.push(`${s.id}: ERROR ${e.message}`);
      console.log(`FAIL ${s.id.padEnd(16)} ${e.message}`);
      if (prevById.has(s.id)) results.push(prevById.get(s.id));
    }
    await sleep(150);
  }

  const out = {
    $schema: "./aircraft.schema.json",
    source: "English Wikipedia, Wikidata and Wikimedia Commons",
    note: "Text from Wikipedia is CC BY-SA 4.0. Each photo carries its own license and author in `photo`.",
    generatedAt: new Date().toISOString(),
    count: results.length,
    aircraft: results,
  };
  await writeFile(OUT_JSON, JSON.stringify(out, null, 2) + "\n");
  await writeFile(
    join(here, "REPORT.md"),
    `# Last build\n\nGenerated ${out.generatedAt}: ${results.length} aircraft, ` +
      `${results.filter((r) => r.photo?.file).length} with a free lead photo.\n\n` +
      (problems.length ? `## Gaps\n\n${problems.map((p) => `- ${p}`).join("\n")}\n` : "No gaps.\n"),
  );
  console.log(`\nWrote ${results.length} aircraft; ${problems.length} with gaps (see REPORT.md).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
