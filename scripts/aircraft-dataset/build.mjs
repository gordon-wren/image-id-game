#!/usr/bin/env node
// Builds public/data/aircraft.json and public/assets/aircraft/*.jpg from the
// Wikipedia articles listed in seed.json.
//
// Sources, per aircraft:
//   - Wikipedia REST summary  -> name, short description, intro extract, Wikidata id
//   - Wikipedia pageimages    -> the article's lead ("title") photo, free images only
//   - Wikipedia infobox       -> role/type, designer, status; lead photo; fallbacks for the rest
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

import { readFile, writeFile, mkdir, stat, readdir, unlink } from "node:fs/promises";
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
    .replace(/&#(\d+);?/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\[(?:citation needed|\d+|[a-z])\]/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([;,])/g, "$1")
    .replace(/,;/g, ";")
    .trim();
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Finds the first date in free text ("9 February 1969", "February 9, 1969", "March 1959", "1938") as ISO. */
function parseDate(s) {
  if (!s) return null;
  const mon = `(${MONTHS.join("|")})`;
  const pad = (n) => String(n).padStart(2, "0");
  const month = (m) => pad(MONTHS.indexOf(m.toLowerCase()) + 1);
  let m;
  if ((m = s.match(/\b(\d{4})-(\d\d)(?:-(\d\d))?\b/))) return [m[1], m[2], m[3]].filter(Boolean).join("-");
  if ((m = s.match(new RegExp(`\\b(\\d{1,2})\\s+${mon}\\s+(\\d{4})`, "i")))) return `${m[3]}-${month(m[2])}-${pad(m[1])}`;
  if ((m = s.match(new RegExp(`\\b${mon}\\s+(\\d{1,2}),?\\s+(\\d{4})`, "i")))) return `${m[3]}-${month(m[1])}-${pad(m[2])}`;
  if ((m = s.match(new RegExp(`\\b${mon}\\s+(\\d{4})`, "i")))) return `${m[2]}-${month(m[1])}`;
  if ((m = s.match(/\b(1[89]\d\d|20\d\d)\b/))) return m[1];
  return null;
}

// Images that are rarely a clear photo of the whole aircraft.
const NOT_A_PHOTO = /\.(svg|gif|tiff?)$|logo|flag|map|diagram|drawing|3[- ]?view|silhouette|cockpit|instrument|engine|insignia|roundel|emblem|seal|icon|patch|crest|badge|interior|cabin/i;

/**
 * Reads label/value rows and the lead image out of the rendered infobox HTML.
 * The rendered page is used rather than wikitext because articles build their
 * infoboxes from many different templates; the HTML always has the same shape.
 */
function parseInfobox(html) {
  const start = html.search(/<table[^>]*class="[^"]*\binfobox\b/);
  if (start < 0) return { fields: {}, image: null };
  const end = html.indexOf("</table>", start);
  const box = html.slice(start, end < 0 ? undefined : end)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<sup[^>]*class="[^"]*reference[^"]*"[\s\S]*?<\/sup>/gi, "")
    .replace(/<span[^>]*class="[^"]*(?:noprint|sortkey)[^"]*"[\s\S]*?<\/span>/gi, "");
  const fields = {};
  const rowRe = /<th[^>]*class="[^"]*infobox-label[^"]*"[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*class="[^"]*infobox-data[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = rowRe.exec(box))) {
    const key = stripHtml(m[1]).toLowerCase().replace(/\s+/g, " ").trim();
    const value = stripHtml(m[2].replace(/<\/li>\s*<li[^>]*>/gi, "; ")).replace(/(;\s*)+/g, "; ").replace(/^[;,\s]+|[;,\s]+$/g, "");
    if (key && value && !fields[key]) fields[key] = value;
  }
  // Some infoboxes lead with the type's logo; take the first image that looks like a photo.
  const image = [...box.matchAll(/href="\/wiki\/File:([^"#?]+)"/g)]
    .map((m) => decodeURIComponent(m[1]).replace(/_/g, " "))
    .find((f) => !NOT_A_PHOTO.test(f));
  return { fields, image: image ?? null };
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
        new URLSearchParams({ action: "wbgetentities", ids: batch.join("|"), props: "labels", format: "json" }),
    );
    // English if there is one, then the language-neutral label, then any language: some
    // items (often photographers) are only labelled in their own language.
    for (const id of batch) {
      const labels = res?.entities?.[id]?.labels ?? {};
      labelCache.set(id, (labels.en ?? labels.mul ?? Object.values(labels)[0])?.value ?? id);
    }
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

// Licenses the game can honour with a credit line. GFDL-only photos are left
// out: the GFDL asks for its full text to travel with the image.
const USABLE_LICENSE = /^(cc0|cc[ -]by(-sa)?\b|public domain|pd\b|attribution|copyrighted free use|ogl|godl|kogl)/i;

/** Commons often lists a GFDL/CC dual license as just "GFDL"; its categories name the CC one. */
function ccFromCategories(categories) {
  const m = String(categories ?? "").match(/(?:^|\|)CC-(BY(?:-SA)?)-([\d.]+)/i);
  return m ? `CC ${m[1].toUpperCase()} ${m[2]}` : null;
}


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
  let license = meta.LicenseShortName ? stripHtml(String(meta.LicenseShortName)) : null;
  if (!license || /^gfdl/i.test(license)) license = ccFromCategories(meta.Categories) ?? license;
  const free = !meta.NonFree && Boolean(license && USABLE_LICENSE.test(license));
  let author = meta.Artist ? stripHtml(String(meta.Artist)) : null;
  // Commons can name the author as a bare Wikidata item ("Q139555801") when it has no
  // label in the wiki's language; look the name up so the credit names a person.
  if (author && /^Q\d+$/.test(author)) author = (await wikidataLabels([author]))[0];
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

const MAX_ARTICLE_PHOTOS = 8;

/** Files to try as the aircraft's photo, best first, with where each came from. */
async function* photoCandidates(seed, infoboxImage, pageImage, title) {
  if (seed.photo) {
    yield { file: seed.photo.replace(/^File:/, ""), from: "seed" };
    return;
  }
  const tried = new Set();
  const fresh = (f) => {
    const key = f?.replace(/_/g, " ");
    if (!key || tried.has(key)) return null;
    tried.add(key);
    return key;
  };
  const infobox = fresh(infoboxImage);
  if (infobox) yield { file: infobox, from: "infobox" };
  const preview = pageImage && !NOT_A_PHOTO.test(pageImage) ? fresh(pageImage) : null;
  if (preview) yield { file: preview, from: "page image" };

  const res = await wpApi({ action: "parse", page: title, prop: "images", redirects: "1" });
  const rest = (res?.parse?.images ?? []).filter((f) => !NOT_A_PHOTO.test(f)).map(fresh).filter(Boolean);
  for (const file of rest.slice(0, MAX_ARTICLE_PHOTOS)) yield { file, from: "article" };
}

function splitList(s) {
  return s ? s.split(/;\s*|\s+and\s+|,\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean) : [];
}

async function buildOne(seed, previous) {
  const titleKey = encodeURIComponent(seed.wikipediaTitle.replace(/ /g, "_"));
  const summary = await get(`https://en.wikipedia.org/api/rest_v1/page/summary/${titleKey}`);
  if (!summary) throw new Error(`no Wikipedia article "${seed.wikipediaTitle}"`);
  const title = summary.title;

  const [parse, pi] = await Promise.all([
    wpApi({ action: "parse", page: title, prop: "text", section: "0", redirects: "1", disablelimitreport: "1", disableeditsection: "1" }),
    wpApi({ action: "query", titles: title, prop: "pageimages|info|revisions", piprop: "name", pilicense: "free", rvprop: "ids|timestamp", redirects: "1" }),
  ]);
  const page = pi?.query?.pages?.[0] ?? {};
  const infobox = parseInfobox(parse?.parse?.text ?? "");
  const ib = (...keys) => keys.map((k) => infobox.fields[k]).find(Boolean) ?? null;

  // A seed can name its own Wikidata item, for aircraft that share an article
  // with a relative (the Ka-52 redirects to the Ka-50's).
  const wikidataId = seed.wikidataId ?? summary.wikibase_item ?? null;
  let wd = null;
  if (wikidataId) {
    const ent = await get(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`);
    wd = ent?.entities ? Object.values(ent.entities)[0] : null;
  }
  const [manufacturersWd, countriesWd, usesWd] = wd
    ? await Promise.all([itemIds(wd, "P176"), itemIds(wd, "P495"), itemIds(wd, "P366")].map(wikidataLabels))
    : [[], [], []];

  const firstFlightIb = ib("first flight");
  const introIb = ib("introduction", "introduction date", "introduced");
  const numberBuiltIb = ib("number built");

  const record = {
    id: seed.id,
    name: title,
    label: seed.label ?? title,
    group: seed.group,
    ...(seed.packAnswerIds ? { packAnswerIds: seed.packAnswerIds } : {}),
    description: summary.description ?? null,
    summary: summary.extract ?? null,
    role: ib("type", "role") ?? (usesWd.length ? usesWd.join("; ") : null),
    manufacturer: manufacturersWd.length ? manufacturersWd : splitList(ib("manufacturer")),
    designer: ib("designer", "designer group", "designers"),
    countryOfOrigin: countriesWd.length ? countriesWd : splitList(ib("national origin", "country of origin", "origin")),
    firstFlight: (wd && wdTime(wd, "P606")) ?? parseDate(firstFlightIb) ?? firstFlightIb,
    introduced: (wd && wdTime(wd, "P729")) ?? parseDate(introIb) ?? introIb,
    status: ib("status"),
    numberBuilt: (wd && wdQuantity(wd, "P1092")) ?? (numberBuiltIb && /^\d[\d,]*$/.test(numberBuiltIb) ? Number(numberBuiltIb.replace(/,/g, "")) : numberBuiltIb),
    wikipedia: {
      title,
      url: summary.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${titleKey}`,
      pageId: page.pageid ?? summary.pageid ?? null,
      revisionId: page.revisions?.[0]?.revid ?? summary.revision ?? null,
    },
    wikidataId,
    photo: null,
    retrievedAt: new Date().toISOString(),
  };

  // The "title photo" is the infobox image. When it is missing or its license
  // isn't usable, try the page image Wikipedia picks for previews, then the
  // article's other photos in order. A seed `photo` pins one file instead.
  let info = null;
  for await (const { file, from } of photoCandidates(seed, infobox.image, page.pageimage, title)) {
    const candidate = await photoInfo(file);
    if (candidate) candidate.chosenFrom = from;
    info ??= candidate;
    if (candidate?.free) { info = candidate; break; }
    await sleep(150);
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
  // Hand-checked values for facts neither Wikidata nor the infobox supplies.
  if (seed.overrides) {
    Object.assign(record, seed.overrides);
    record.overridden = Object.keys(seed.overrides);
  }
  return record;
}

/** A record that isn't re-fetched still takes the fields that come from the seed. */
function reuse(record, seed) {
  const { packAnswerIds, ...rest } = record;
  return {
    ...rest,
    label: seed.label ?? record.name,
    group: seed.group,
    ...(seed.packAnswerIds ? { packAnswerIds: seed.packAnswerIds } : {}),
  };
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
      if (prevById.has(s.id)) results.push(reuse(prevById.get(s.id), s));
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
      if (prevById.has(s.id)) results.push(reuse(prevById.get(s.id), s));
    }
    await sleep(150);
  }

  // `results` holds every seed entry (re-fetched or reused), so this also clears
  // a photo replaced by one with a different extension during an --only run.
  const keep = new Set(results.map((r) => r.photo?.file?.slice(IMG_PUBLIC_PREFIX.length)).filter(Boolean));
  for (const f of await readdir(OUT_IMG_DIR)) if (!keep.has(f)) await unlink(join(OUT_IMG_DIR, f));

  const out = {
    $schema: "./aircraft.schema.json",
    source: "English Wikipedia, Wikidata and Wikimedia Commons",
    note: "Text from Wikipedia is CC BY-SA 4.0. Each photo carries its own license and author in `photo`.",
    generatedAt: new Date().toISOString(),
    count: results.length,
    aircraft: results,
  };
  await writeFile(OUT_JSON, JSON.stringify(out, null, 2) + "\n");
  const unchecked = results.filter((r) => r.photo?.file && r.photo.chosenFrom === "article");
  await writeFile(
    join(here, "REPORT.md"),
    `# Last build\n\nGenerated ${out.generatedAt}: ${results.length} aircraft, ` +
      `${results.filter((r) => r.photo?.file).length} with a free lead photo.\n\n` +
      (problems.length ? `## Gaps\n\n${problems.map((p) => `- ${p}`).join("\n")}\n` : "No gaps.\n") +
      (unchecked.length
        ? `\n## Check these photos by eye\n\nThe lead photo wasn't usable, so these came from further down the article ` +
          `and may show a prototype, a variant or a detail. Pin a better one with \`photo\` in seed.json.\n\n` +
          unchecked.map((r) => `- ${r.id}: [${r.photo.sourceFile}](${r.photo.sourcePage})`).join("\n") + "\n"
        : ""),
  );
  console.log(`\nWrote ${results.length} aircraft; ${problems.length} with gaps (see REPORT.md).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
