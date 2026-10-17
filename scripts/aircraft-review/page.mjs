#!/usr/bin/env node
// Builds the aircraft review page from a fetch.mjs output folder: writes
// <dir>/index.html next to <dir>/thumbs/, ready to publish as an Artifact with
// the `db` capability (decisions are saved to its "decisions" collection).
// See docs/aircraft-review.md.
//
// Usage: node scripts/aircraft-review/page.mjs <dir> "<page title>" "<heading>" "<eyebrow>"
//   e.g. node scripts/aircraft-review/page.mjs /tmp/review-ru "Soviet Military Aircraft Review" \
//        "Soviet and Russian military aircraft" "Soviet Union and Russia"

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [dir, title, heading, eyebrow] = process.argv.slice(2);
if (!dir || !title || !heading || !eyebrow) {
  console.error('Usage: node scripts/aircraft-review/page.mjs <dir> "<page title>" "<heading>" "<eyebrow>"');
  process.exit(1);
}

const entries = JSON.parse(await readFile(join(dir, "review.json"), "utf8"));
const missing = entries.filter((a) => !a.dropped && !a.error && !a.thumb);
if (missing.length) throw new Error("No thumbnail for: " + missing.map((a) => a.id).join(", "));
const data = {
  aircraft: entries.filter((a) => !a.dropped && !a.error),
  dropped: entries.filter((a) => a.dropped).map((a) => ({ name: a.name, dropped: a.dropped })),
};
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const html = template()
  .replace("__TITLE__", escapeHtml(title))
  .replace("__HEADING__", escapeHtml(heading))
  .replace("__EYEBROW__", escapeHtml(eyebrow))
  // JSON inside a <script> tag: escape "<" so the data can never close the tag.
  .replace("__DATA__", () => JSON.stringify(data).replace(/</g, "\\u003c"));
await writeFile(join(dir, "index.html"), html);
console.log(`Wrote ${join(dir, "index.html")} (${data.aircraft.length} aircraft).`);

// The page: a sticky tally bar, decade sections of photo cards, and Approve /
// Skip / Note on each card. Decisions go to the db "decisions" collection, or to
// this browser's storage when the page runs without db.
function template() {
  return `<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Source+Sans+3:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a sticky tally bar over decade sections of photo cards, read like a type register. */
:root {
  --bg: #f2f3ee; --surface: #ffffff; --ink: #1c231f; --muted: #5a645d; --line: #d5dad1;
  --accent: #2c4a7c; --accent-soft: #e3e9f3; --approve: #2e7a4c; --approve-soft: #e2f1e7; --skip: #9b3c31; --skip-soft: #f6e4e1; --note: #8a6a12; --note-soft: #f7efd6;
  --font-display: "Barlow Condensed", "Arial Narrow", system-ui, sans-serif;
  --font-body: "Source Sans 3", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-data: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --radius: 10px;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121614; --surface: #1b211e; --ink: #e7ebe6; --muted: #a2aca5; --line: #303833;
  --accent: #9db7e8; --accent-soft: #24304a; --approve: #7fcf9c; --approve-soft: #1d3326; --skip: #f0a196; --skip-soft: #3a2420; --note: #e3c46e; --note-soft: #352e19; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121614; --surface: #1b211e; --ink: #e7ebe6; --muted: #a2aca5; --line: #303833;
  --accent: #9db7e8; --accent-soft: #24304a; --approve: #7fcf9c; --approve-soft: #1d3326; --skip: #f0a196; --skip-soft: #3a2420; --note: #e3c46e; --note-soft: #352e19; color-scheme: dark }
body { background: var(--bg); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.5; }
.wrap { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 0 48px; }
a { color: var(--accent); }
h1, h2, h3 { font-family: var(--font-display); text-wrap: balance; margin: 0; letter-spacing: 0.01em; }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--bg); border-bottom: 1px solid var(--line); }
.bar-inner { max-width: 1180px; margin: 0 auto; padding-inline: 16px; padding-block: 10px; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; justify-content: space-between; }
.tally { display: flex; flex-wrap: wrap; gap: 6px 14px; font-family: var(--font-data); font-size: 13px; font-variant-numeric: tabular-nums; }
.tally b { font-weight: 500; }
.t-ok { color: var(--approve); } .t-skip { color: var(--skip); } .t-open { color: var(--muted); }
.tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip-btn, .btn { font: 500 13px var(--font-body); border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 999px; padding: 5px 12px; cursor: pointer; }
.chip-btn[aria-pressed="true"] { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.btn:hover, .chip-btn:hover { border-color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
header.intro { padding-block: 28px 8px; display: grid; gap: 14px; }
.eyebrow { font: 500 12px var(--font-data); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
header.intro h1 { font-size: clamp(32px, 6vw, 48px); font-weight: 700; line-height: 1; }
.lede { max-width: 68ch; margin: 0; color: var(--ink); }
.sync { font-size: 13px; color: var(--muted); }
.panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; margin-block: 18px 8px; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; min-width: 0; }
.panel h2 { font-size: 20px; font-weight: 600; margin-bottom: 6px; }
.panel p, .panel li { font-size: 14px; }
.panel ul { margin: 6px 0 0; padding-left: 18px; }
.panel code { font-family: var(--font-data); font-size: 12.5px; background: var(--accent-soft); padding: 1px 5px; border-radius: 4px; }
table.impact { width: 100%; border-collapse: collapse; font-size: 14px; }
table.impact td { padding: 4px 0; border-bottom: 1px solid var(--line); }
table.impact td:last-child { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
nav.decades { display: flex; flex-wrap: wrap; gap: 6px; margin-block: 18px 6px; }
nav.decades a { font: 600 15px var(--font-display); text-decoration: none; color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 3px 9px; background: var(--surface); }
nav.decades a:hover { border-color: var(--accent); }
section.decade { margin-top: 30px; scroll-margin-top: 70px; }
.decade-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; border-bottom: 2px solid var(--ink); padding-bottom: 6px; margin-bottom: 14px; }
.decade-head h2 { font-size: 30px; font-weight: 700; }
.decade-head h2 small { font: 500 14px var(--font-data); color: var(--muted); margin-left: 8px; letter-spacing: 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
.card.is-approve { border-color: var(--approve); box-shadow: inset 0 0 0 1px var(--approve); }
.card.is-skip { border-color: var(--skip); opacity: 0.72; }
.photo { aspect-ratio: 4 / 3; max-width: 100%; background: var(--accent-soft); display: block; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
.card h3 { font-size: 21px; font-weight: 600; line-height: 1.1; }
.desc { font-size: 13px; color: var(--muted); margin: 0; }
.years { font: 400 12.5px var(--font-data); font-variant-numeric: tabular-nums; color: var(--ink); }
.hand { color: var(--note); }
.tags { display: flex; flex-wrap: wrap; gap: 5px; }
.tag { font: 500 11.5px var(--font-data); border-radius: 4px; padding: 1px 6px; background: var(--accent-soft); color: var(--accent); }
.tag.engine { background: transparent; border: 1px solid var(--line); color: var(--muted); }
.lic { font-size: 12.5px; color: var(--muted); }
.lic a { color: var(--muted); }
.flag { font-size: 12.5px; background: var(--note-soft); color: var(--ink); border-radius: 6px; padding: 5px 8px; }
.actions { display: grid; grid-template-columns: 1fr 1fr auto; gap: 6px; margin-top: auto; padding-top: 6px; }
.act { font: 600 13px var(--font-body); border-radius: 7px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 7px 0; cursor: pointer; }
.act.approve[aria-pressed="true"] { background: var(--approve); border-color: var(--approve); color: var(--surface); }
.act.skip[aria-pressed="true"] { background: var(--skip); border-color: var(--skip); color: var(--surface); }
.act.note-toggle { padding: 7px 10px; font-weight: 500; }
.note-box { display: grid; gap: 4px; }
.note-box label { font-size: 12px; color: var(--muted); }
.note-box textarea { font: 14px var(--font-body); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; background: var(--bg); color: var(--ink); resize: vertical; min-height: 54px; }
.note-saved { font-size: 13px; background: var(--note-soft); border-radius: 6px; padding: 5px 8px; }
.bulk { font: 500 13px var(--font-body); }
.list { columns: 3 220px; column-gap: 24px; font-size: 14px; margin: 8px 0 0; padding: 0; list-style: none; }
.list li { break-inside: avoid; padding: 2px 0; border-bottom: 1px dotted var(--line); display: flex; justify-content: space-between; gap: 8px; }
.list li span { font-family: var(--font-data); font-size: 12px; color: var(--muted); white-space: nowrap; }
.toast { position: fixed; left: 50%; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); background: var(--ink); color: var(--bg); border-radius: 999px; padding: 8px 16px; font-size: 14px; }
.copy-fallback { width: 100%; min-height: 120px; font: 12.5px var(--font-data); background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 8px; }
.empty { color: var(--muted); font-size: 14px; }
@media (prefers-reduced-motion: no-preference) { .card { transition: border-color .15s, opacity .15s; } }
</style>

<div class="bar" role="region" aria-label="Review progress">
  <div class="bar-inner">
    <div class="tally" aria-live="polite">
      <span class="t-ok"><b id="n-ok">0</b> approved</span>
      <span class="t-skip"><b id="n-skip">0</b> skipped</span>
      <span class="t-open"><b id="n-open">0</b> to review</span>
    </div>
    <div class="tools" role="group" aria-label="Show">
      <button class="chip-btn" data-filter="all" aria-pressed="true">All</button>
      <button class="chip-btn" data-filter="open" aria-pressed="false">To review</button>
      <button class="chip-btn" data-filter="approve" aria-pressed="false">Approved</button>
      <button class="chip-btn" data-filter="skip" aria-pressed="false">Skipped</button>
      <button class="btn" id="copy">Copy decisions</button>
    </div>
  </div>
</div>

<main class="wrap">
  <header class="intro">
    <span class="eyebrow">Spot · aircraft dataset · __EYEBROW__</span>
    <h1>__HEADING__</h1>
    <p class="lede"><span id="n-total"></span> aircraft proposed for the dataset, each with a photo from Wikipedia or Wikimedia Commons. Approve or skip each one, and add a note if a photo or detail needs changing. Nothing has been added to the game yet.</p>
    <p class="sync" id="sync">Loading saved decisions…</p>
  </header>

  <nav class="decades" id="nav" aria-label="Jump to decade"></nav>
  <div id="sections"></div>

  <section class="decade" id="dropped">
    <div class="decade-head"><h2>Left out</h2></div>
    <ul class="list" id="dropped-list"></ul>
  </section>
</main>

<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  const DATA = JSON.parse(document.getElementById("data").textContent);
  const LS = "us-military-review";
  const ERAS = { 1910: "WWI era", 1920: "Between the wars", 1930: "Between the wars", 1940: "WWII and after", 1950: "Korea and the jet age", 1960: "Vietnam era", 1970: "Late Cold War", 1980: "Late Cold War", 1990: "Post-Cold War", 2000: "War on terror", 2010: "Today", 2020: "Today" };
  const CAT = { "airborne-early-warning": "early warning", "electronic-warfare": "electronic warfare", "airborne-command": "airborne command", "utility-helicopter": "utility helicopter", "cargo-helicopter": "cargo helicopter", "attack-helicopter": "attack helicopter", uav: "drone" };
  let decisions = {};
  let filter = "all";
  let db = null;
  let openNote = null;

  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch { return {}; } };
  const writeLocal = () => { try { localStorage.setItem(LS, JSON.stringify(decisions)); } catch {} };
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  const aircraft = DATA.aircraft;
  const decadeOf = (a) => (a.inService ? Math.floor((a.introduced ?? a.firstFlight) / 10) * 10 : "later");
  const groups = new Map();
  for (const a of [...aircraft].sort((x, y) => (x.introduced ?? x.firstFlight ?? 9999) - (y.introduced ?? y.firstFlight ?? 9999))) {
    const k = decadeOf(a); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === "later") - (b === "later") || a - b);

  document.getElementById("n-total").textContent = aircraft.length;

  const nav = document.getElementById("nav");
  for (const k of keys) { const a = el("a", null, k === "later" ? "Not yet in service" : k + "s"); a.href = "#d-" + k; nav.append(a); }
  const dr = document.getElementById("dropped-list");
  document.getElementById("dropped").hidden = DATA.dropped.length === 0;
  for (const d of DATA.dropped) { const li = el("li"); li.append(el("span", null, "")); li.firstChild.replaceWith(el("b", null, d.name)); li.append(el("span", null, d.dropped)); li.lastChild.style.whiteSpace = "normal"; dr.append(li); }

  const sections = document.getElementById("sections");
  const cards = new Map();
  for (const k of keys) {
    const list = groups.get(k);
    const sec = el("section", "decade"); sec.id = "d-" + k;
    const head = el("div", "decade-head");
    const h = el("h2", null, k === "later" ? "Not yet in service" : k + "s");
    h.append(el("small", null, (k === "later" ? "flying, not operational" : ERAS[k]) + " · " + list.length));
    const bulk = el("button", "btn bulk", "Approve the rest"); bulk.dataset.decade = k;
    head.append(h, bulk);
    const grid = el("div", "grid");
    for (const a of list) { const c = card(a); cards.set(a.id, c); grid.append(c); }
    sec.append(head, grid); sections.append(sec);
  }

  function card(a) {
    const c = el("article", "card"); c.dataset.id = a.id;
    const ph = el("a", "photo"); ph.href = a.photo.sourcePage; ph.target = "_blank"; ph.rel = "noreferrer";
    const img = el("img"); img.src = a.thumb; img.alt = a.name; img.loading = "lazy"; ph.append(img);
    const b = el("div", "body");
    b.append(el("h3", null, a.name));
    if (a.description) b.append(el("p", "desc", a.description));
    const yrs = el("div", "years");
    yrs.append("First flight " + (a.firstFlight ?? "—") + " · Service ");
    if (!a.inService) yrs.append("not yet");
    else { yrs.append(String(a.introduced ?? "—")); if (a.introducedByHand) yrs.append(el("span", "hand", " (by hand)")); }
    b.append(yrs);
    const tags = el("div", "tags"); tags.append(el("span", "tag", CAT[a.category] || a.category), el("span", "tag engine", a.engine)); b.append(tags);
    const lic = el("div", "lic"); lic.append(a.photo.license + " · ");
    const src = el("a", null, "photo"); src.href = a.photo.sourcePage; src.target = "_blank"; src.rel = "noreferrer";
    const wiki = el("a", null, "article"); wiki.href = a.wikipedia; wiki.target = "_blank"; wiki.rel = "noreferrer";
    lic.append(src, " · ", wiki); b.append(lic);
    if (a.photo.src && a.photo.src !== "Wikipedia lead photo") b.append(el("div", "flag", a.photo.src + "."));
    if (a.note) b.append(el("div", "flag", a.note));
    const saved = el("div", "note-saved"); saved.hidden = true; b.append(saved);
    const box = el("div", "note-box"); box.hidden = true;
    const lab = el("label", null, "Note (e.g. use a different photo)"); lab.htmlFor = "note-" + a.id;
    const ta = el("textarea"); ta.id = "note-" + a.id; ta.rows = 2;
    const save = el("button", "btn", "Save note"); save.dataset.save = a.id;
    box.append(lab, ta, save); b.append(box);
    const acts = el("div", "actions");
    const ok = el("button", "act approve", "Approve"); ok.dataset.act = "approve"; ok.dataset.id = a.id;
    const sk = el("button", "act skip", "Skip"); sk.dataset.act = "skip"; sk.dataset.id = a.id;
    const nt = el("button", "act note-toggle", "Note"); nt.dataset.note = a.id; nt.setAttribute("aria-expanded", "false");
    acts.append(ok, sk, nt); b.append(acts);
    c.append(ph, b);
    return c;
  }

  function render() {
    let ok = 0, sk = 0;
    for (const a of aircraft) {
      const d = decisions[a.id] || {};
      const c = cards.get(a.id);
      c.classList.toggle("is-approve", d.decision === "approve");
      c.classList.toggle("is-skip", d.decision === "skip");
      c.querySelector(".approve").setAttribute("aria-pressed", String(d.decision === "approve"));
      c.querySelector(".skip").setAttribute("aria-pressed", String(d.decision === "skip"));
      const saved = c.querySelector(".note-saved"); saved.hidden = !d.note; saved.textContent = d.note ? "Note: " + d.note : "";
      if (d.decision === "approve") ok++; else if (d.decision === "skip") sk++;
      const state = d.decision || "open";
      c.hidden = !(filter === "all" || filter === state);
    }
    for (const sec of sections.children) sec.hidden = [...sec.querySelectorAll(".card")].every((c) => c.hidden);
    document.getElementById("n-ok").textContent = ok;
    document.getElementById("n-skip").textContent = sk;
    document.getElementById("n-open").textContent = aircraft.length - ok - sk;
  }

  async function save(id, next) {
    const prev = decisions[id];
    const clean = {};
    if (next?.decision) clean.decision = next.decision;
    if (next?.note) clean.note = next.note;
    if (clean.decision || clean.note) decisions[id] = clean; else delete decisions[id];
    writeLocal(); render();
    if (!db) return;
    try {
      if (decisions[id]) await db.collection("decisions").doc(id).set({ ...decisions[id], at: new Date().toISOString() });
      else await db.collection("decisions").doc(id).delete();
    } catch (e) {
      decisions[id] = prev; writeLocal(); render();
      toast("Couldn't save that decision. Your choices are kept in this browser; use Copy decisions to send them.");
    }
  }

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.filter) { filter = t.dataset.filter; document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); render(); return; }
    if (t.dataset.act) { const cur = decisions[t.dataset.id] || {}; await save(t.dataset.id, { ...cur, decision: cur.decision === t.dataset.act ? undefined : t.dataset.act }); return; }
    if (t.dataset.note) {
      const c = cards.get(t.dataset.note); const box = c.querySelector(".note-box"); box.hidden = !box.hidden;
      t.setAttribute("aria-expanded", String(!box.hidden));
      if (!box.hidden) { const ta = box.querySelector("textarea"); ta.value = decisions[t.dataset.note]?.note || ""; ta.focus(); }
      return;
    }
    if (t.dataset.save) {
      const id = t.dataset.save; const c = cards.get(id); const ta = c.querySelector("textarea");
      await save(id, { ...(decisions[id] || {}), note: ta.value.trim() || undefined });
      c.querySelector(".note-box").hidden = true; c.querySelector(".note-toggle").setAttribute("aria-expanded", "false");
      toast("Note saved"); return;
    }
    if (t.dataset.decade) {
      const list = groups.get(isNaN(+t.dataset.decade) ? t.dataset.decade : +t.dataset.decade) || [];
      const todo = list.filter((a) => !decisions[a.id]?.decision);
      for (const a of todo) await save(a.id, { ...(decisions[a.id] || {}), decision: "approve" });
      toast(todo.length ? "Approved " + todo.length + " aircraft" : "Nothing left to approve here"); return;
    }
    if (t.id === "copy") copy();
  });

  function summary() {
    const by = (k) => aircraft.filter((a) => decisions[a.id]?.decision === k).map((a) => a.id);
    const notes = aircraft.filter((a) => decisions[a.id]?.note).map((a) => "- " + a.id + ": " + decisions[a.id].note);
    return ["Approved (" + by("approve").length + "): " + by("approve").join(", "), "Skipped (" + by("skip").length + "): " + by("skip").join(", "),
      "Not reviewed: " + aircraft.filter((a) => !decisions[a.id]?.decision).map((a) => a.id).join(", "), notes.length ? "Notes:\\n" + notes.join("\\n") : "Notes: none"].join("\\n\\n");
  }
  async function copy() {
    const text = summary();
    try { await navigator.clipboard.writeText(text); toast("Decisions copied"); }
    catch {
      let ta = document.getElementById("copy-text");
      if (!ta) { ta = el("textarea", "copy-fallback"); ta.id = "copy-text"; ta.readOnly = true; document.querySelector("header.intro").append(ta); }
      ta.value = text; ta.focus(); ta.select(); toast("Select all and copy the text above");
    }
  }
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector(".toast"); if (!t) { t = el("div", "toast"); t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  decisions = readLocal();
  render();
  const sync = document.getElementById("sync");
  sync.textContent = "Decisions are saved in this browser.";
  (async () => {
    const store = window.claude ? await window.claude.use("db") : null;
    if (!store) { sync.textContent = "Decisions are saved in this browser. Use Copy decisions to send them to Claude."; return; }
    db = store;
    db.collection("decisions").onSnapshot((snap) => {
      const next = {};
      for (const d of snap.docs) { const v = d.data(); if (v && (v.decision || v.note)) next[d.id] = { decision: v.decision, note: v.note }; }
      decisions = next; writeLocal(); render();
      sync.textContent = "Decisions save automatically, and Claude can read them.";
    }, () => { db = null; sync.textContent = "Decisions are saved in this browser. Use Copy decisions to send them to Claude."; });
  })();
})();
</script>
`;
}
