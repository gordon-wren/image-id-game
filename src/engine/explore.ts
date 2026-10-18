import type { QuestionPack } from "./types";
import { ASSET_BASE, buildQuestions, type SetAircraft } from "./sets";
import { withBase } from "./pack";

// ============================================================================
// EXPLORE
// The landing page's flow chart: All aircraft → Military/Civil → a group-by
// (country, era or conflict) → a last column (role or maker). Any bar or ribbon
// is a set you can play, built when clicked. Data comes from
// public/data/explore.json, written by `npm run packs`.
// ============================================================================

export interface ExploreAircraft extends SetAircraft {
  use: "military" | "civil";
  nation: string;
  era: string;
  role: string;
  maker: string;
  conflicts: string[];
  /** A 240 × 240 thumbnail, path under public/. */
  thumb: string;
}

export interface ExploreData {
  minAircraft: number;
  questionsPerRound: number;
  /** Era names in chronological order, ending with "Not yet in service". */
  eras: string[];
  aircraft: ExploreAircraft[];
}

export type GroupBy = "nation" | "era" | "conflict";
export type LastColumn = "role" | "maker";

export const GROUP_BY_LABELS: Record<GroupBy, string> = { nation: "Country", era: "Era (service entry)", conflict: "War / conflict" };
export const LAST_COLUMN_LABELS: Record<LastColumn, string> = { role: "Role", maker: "Manufacturer" };

export interface FlowNode {
  id: string;
  name: string;
  column: number;
  /** Aircraft ids that reach this node. */
  ids: string[];
}

export interface FlowLink {
  id: string;
  source: string;
  target: string;
  /** Aircraft ids flowing along this link. */
  ids: string[];
}

export interface Flow {
  nodes: FlowNode[];
  links: FlowLink[];
}

const NO_CONFLICT = "No conflict recorded";
const CIVIL_NO_CONFLICT = "Civil (no conflicts)";

/** Groups that aren't a real category: the "none" buckets and the "Other …" bundles. Drawn grey, listed last. */
export function isCatchAll(name: string): boolean {
  return name === NO_CONFLICT || name === CIVIL_NO_CONFLICT || name.startsWith("Other ");
}

/** True when the data has anything to group by for this option (conflicts are curated over time). */
export function canGroupBy(data: ExploreData, by: GroupBy): boolean {
  return by !== "conflict" || data.aircraft.some((a) => a.conflicts.length > 0);
}

/**
 * Builds the four columns. Groups and makers smaller than `minAircraft` are
 * bundled ("Other countries", "Other manufacturers") so the chart stays
 * readable; eras keep their chronological order. An aircraft in several
 * conflicts flows into each of them.
 */
export function buildFlow(data: ExploreData, by: GroupBy, last: LastColumn): Flow {
  const min = data.minAircraft;
  const rawGroups = (a: ExploreAircraft): string[] => {
    if (by === "era") return [a.era];
    if (by === "nation") return [a.nation];
    if (a.use === "civil") return [CIVIL_NO_CONFLICT];
    return a.conflicts.length ? a.conflicts : [NO_CONFLICT];
  };
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const a of data.aircraft) rawGroups(a).forEach((g) => bump("g:" + g));
  for (const a of data.aircraft) bump("l:" + a[last]);

  const bundleGroup = by === "nation" ? "Other countries" : by === "conflict" ? "Other conflicts" : null;
  const groupsOf = (a: ExploreAircraft) =>
    [...new Set(rawGroups(a).map((g) => (bundleGroup && (counts.get("g:" + g) ?? 0) < min && !isCatchAll(g) ? bundleGroup : g)))];
  const lastOf = (a: ExploreAircraft) => (last === "maker" && (counts.get("l:" + a.maker) ?? 0) < min ? "Other manufacturers" : a[last]);

  const nodes = new Map<string, FlowNode>();
  const links = new Map<string, FlowLink>();
  const node = (column: number, name: string, id: string) => {
    if (!nodes.has(id)) nodes.set(id, { id, name, column, ids: [] });
    return nodes.get(id)!;
  };
  const link = (s: FlowNode, t: FlowNode, aircraftId: string) => {
    const id = `${s.id}>${t.id}`;
    if (!links.has(id)) links.set(id, { id, source: s.id, target: t.id, ids: [] });
    links.get(id)!.ids.push(aircraftId);
  };
  const add = (n: FlowNode, id: string) => { if (!n.ids.includes(id)) n.ids.push(id); };

  for (const a of data.aircraft) {
    const all = node(0, "All aircraft", "all");
    const use = node(1, a.use === "military" ? "Military" : "Civil", `use:${a.use}`);
    const end = node(3, lastOf(a), `last:${lastOf(a)}`);
    add(all, a.id); add(use, a.id); add(end, a.id);
    link(all, use, a.id);
    for (const g of groupsOf(a)) {
      const grp = node(2, g, `group:${g}`);
      add(grp, a.id);
      link(use, grp, a.id);
      link(grp, end, a.id);
    }
  }

  // Order: eras chronologically; everything else largest first, with the
  // bundles and "none" groups last.
  const tail = (n: FlowNode) => (!isCatchAll(n.name) ? 0 : n.name.startsWith("Other ") ? 1 : 2);
  const rank = (n: FlowNode) => (by === "era" && n.column === 2 ? data.eras.indexOf(n.name) : 0);
  const ordered = [...nodes.values()].sort(
    (a, b) => a.column - b.column || (a.column === 1 ? (a.id === "use:military" ? -1 : 1) : 0) || rank(a) - rank(b) || tail(a) - tail(b) || b.ids.length - a.ids.length || a.name.localeCompare(b.name),
  );
  return { nodes: ordered, links: [...links.values()] };
}

export interface PlacedNode extends FlowNode {
  x: number;
  y: number;
  height: number;
}

export interface PlacedLink extends FlowLink {
  /** A filled ribbon from the source bar's right edge to the target bar's left edge. */
  path: string;
  /** Flow units carried, for widths and labels. */
  value: number;
}

export interface Layout {
  nodes: PlacedNode[];
  links: PlacedLink[];
}

/**
 * Places a flow as a Sankey-style chart: one column per stage, bar heights and
 * ribbon widths proportional to aircraft, ribbons stacked in the order of the
 * bars they connect so they don't cross inside a bar.
 */
export function layoutFlow(flow: Flow, opts: { width: number; height: number; barWidth?: number; gap?: number; labelSpace?: number }): Layout {
  const { width, height, barWidth = 12, gap = 10, labelSpace = 170 } = opts;
  const columns = Math.max(...flow.nodes.map((n) => n.column)) + 1;
  const linksOut = new Map<string, FlowLink[]>(), linksIn = new Map<string, FlowLink[]>();
  for (const l of flow.links) {
    (linksOut.get(l.source) ?? linksOut.set(l.source, []).get(l.source)!).push(l);
    (linksIn.get(l.target) ?? linksIn.set(l.target, []).get(l.target)!).push(l);
  }
  const sum = (ls: FlowLink[] | undefined) => (ls ?? []).reduce((s, l) => s + l.ids.length, 0);
  // A node's size is the larger of what flows in and out (they differ only when
  // an aircraft is counted in several conflicts).
  const value = new Map(flow.nodes.map((n) => [n.id, Math.max(sum(linksIn.get(n.id)), sum(linksOut.get(n.id)), n.ids.length)]));

  const byColumn = Array.from({ length: columns }, (_, c) => flow.nodes.filter((n) => n.column === c));
  const scale = Math.min(...byColumn.map((col) => (height - gap * (col.length - 1)) / col.reduce((s, n) => s + value.get(n.id)!, 0)));
  const step = (width - barWidth - labelSpace) / Math.max(1, columns - 1);

  const placed = new Map<string, PlacedNode>();
  for (const [c, col] of byColumn.entries()) {
    const total = col.reduce((s, n) => s + value.get(n.id)! * scale, 0) + gap * (col.length - 1);
    let y = (height - total) / 2;
    for (const n of col) {
      const h = Math.max(2, value.get(n.id)! * scale);
      placed.set(n.id, { ...n, x: c * step, y, height: h });
      y += h + gap;
    }
  }

  // Stack each bar's ribbons in the vertical order of the bars at their other end.
  const outY = new Map<string, number>(), inY = new Map<string, number>();
  const offsets = new Map<string, { sy: number; ty: number }>();
  const centre = (id: string) => placed.get(id)!.y + placed.get(id)!.height / 2;
  for (const l of [...flow.links].sort((a, b) => centre(a.target) - centre(b.target))) {
    const s = outY.get(l.source) ?? placed.get(l.source)!.y;
    outY.set(l.source, s + l.ids.length * scale);
    offsets.set(l.id, { sy: s, ty: 0 });
  }
  for (const l of [...flow.links].sort((a, b) => centre(a.source) - centre(b.source))) {
    const t = inY.get(l.target) ?? placed.get(l.target)!.y;
    inY.set(l.target, t + l.ids.length * scale);
    offsets.get(l.id)!.ty = t;
  }

  const links = flow.links.map((l) => {
    const s = placed.get(l.source)!, t = placed.get(l.target)!;
    const w = Math.max(1, l.ids.length * scale);
    const { sy, ty } = offsets.get(l.id)!;
    const x0 = s.x + barWidth, x1 = t.x, mx = (x0 + x1) / 2;
    const path = `M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty} L${x1},${ty + w} C${mx},${ty + w} ${mx},${sy + w} ${x0},${sy + w} Z`;
    return { ...l, path, value: l.ids.length };
  });
  return { nodes: [...placed.values()], links };
}

const slug = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What's been picked: a bar, or a ribbon (the overlap of the two bars it joins). */
export interface ExploreSelection {
  /** "Fighters", or "United States × Fighters" for a ribbon. */
  title: string;
  /** Context above the title, e.g. "Military" or "Country × Role". */
  context: string;
  ids: string[];
}

/** A playable pack for the aircraft in a selection; `null` if it has too few. */
export function buildExplorePack(data: ExploreData, selection: ExploreSelection, accent: string): QuestionPack | null {
  const members = data.aircraft.filter((a) => selection.ids.includes(a.id));
  if (members.length < data.minAircraft) return null;
  const id = `explore-${slug(selection.context)}-${slug(selection.title)}`;
  return {
    id,
    title: selection.title,
    description: `${members.length} aircraft · ${selection.context}`,
    path: ["Explore"],
    theme: { accent },
    assetBase: ASSET_BASE,
    questionsPerRound: data.questionsPerRound,
    questions: buildQuestions(id, members, data.aircraft),
  };
}

export async function loadExplore(): Promise<ExploreData> {
  const res = await fetch(withBase("data/explore.json"));
  if (!res.ok) throw new Error(`Could not load the Explore data (${res.status}).`);
  return res.json();
}
