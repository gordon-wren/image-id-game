import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  Handle,
  Position,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { QuestionPack } from "../engine/types";
import type { PlayMode } from "../engine/usePlayMode";
import {
  GROUP_BY_LABELS,
  LAST_COLUMN_LABELS,
  buildExplorePack,
  buildFlow,
  canGroupBy,
  layoutFlow,
  type ExploreData,
  type ExploreSelection,
  type GroupBy,
  type LastColumn,
} from "../engine/explore";

interface ExploreProps {
  data: ExploreData;
  mode: PlayMode;
  onPlay: (pack: QuestionPack) => void;
  onStudy: (pack: QuestionPack) => void;
  onBrowse: () => void;
}

// Colours for the group-by column (and the ribbons through it). Mid-tone hues
// read on both light and dark backgrounds; bundles and "none" groups are grey.
const PALETTE = ["#4e79a7", "#e15759", "#59a14f", "#f28e2b", "#76b7b2", "#b07aa1", "#c9a227", "#9c755f", "#ff9da7"];
const GREY = "#8c8c8c";
const BAR = 12;
const HEIGHT = 560;

type BarData = { name: string; count: number; height: number; color: string; picked: boolean };
type RibbonData = { path: string; color: string; picked: boolean };
type HeadingData = { text: string };

function Bar({ data }: NodeProps<Node<BarData>>) {
  return (
    <div className={`explore-bar${data.picked ? " picked" : ""}`} style={{ height: data.height, background: data.color }}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <span className="explore-bar-label">
        {data.name} <span className="explore-bar-count">{data.count}</span>
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function Heading({ data }: NodeProps<Node<HeadingData>>) {
  return <span className="explore-heading">{data.text}</span>;
}

/** Draws the precomputed ribbon; React Flow's handle positions are ignored. */
function Ribbon({ data }: EdgeProps<Edge<RibbonData>>) {
  if (!data) return null;
  return <path d={data.path} fill={data.color} fillOpacity={data.picked ? 0.62 : 0.28} className="explore-ribbon" />;
}

const nodeTypes = { bar: Bar, heading: Heading };
const edgeTypes = { ribbon: Ribbon };

export function Explore({ data, mode, onPlay, onStudy, onBrowse }: ExploreProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>("nation");
  const [last, setLast] = useState<LastColumn>("role");
  const [picked, setPicked] = useState<string>("all");
  const [width, setWidth] = useState(760);
  const chartRef = useRef<HTMLDivElement>(null);

  // Lay the chart out to the space it has.
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(640, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const flow = useMemo(() => buildFlow(data, groupBy, last), [data, groupBy, last]);
  const layout = useMemo(() => layoutFlow(flow, { width, height: HEIGHT, barWidth: BAR }), [flow, width]);

  const colorOf = useMemo(() => {
    const groups = flow.nodes.filter((n) => n.column === 2);
    let i = 0;
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.id, /^(Other |No conflict|Civil \(no)/.test(g.name) ? GREY : PALETTE[i++ % PALETTE.length]);
    return m;
  }, [flow]);

  const columnTitles = ["All", "Use", GROUP_BY_LABELS[groupBy], LAST_COLUMN_LABELS[last]];
  const nodes: Node[] = useMemo(() => {
    const bars: Node<BarData>[] = layout.nodes.map((n) => ({
      id: n.id,
      type: "bar",
      position: { x: n.x, y: n.y },
      data: { name: n.name, count: n.ids.length, height: n.height, color: n.column === 2 ? colorOf.get(n.id)! : "var(--explore-bar)", picked: picked === n.id },
      style: { width: BAR, height: n.height },
      draggable: false,
      ariaLabel: `${n.name}, ${n.ids.length} aircraft`,
    }));
    const xs = [0, 1, 2, 3].map((c) => layout.nodes.find((n) => n.column === c)?.x ?? 0);
    const headings: Node<HeadingData>[] = xs.map((x, c) => ({
      id: `heading:${c}`, type: "heading", position: { x, y: -28 }, data: { text: columnTitles[c] },
      draggable: false, selectable: false, focusable: false,
    }));
    return [...headings, ...bars];
  }, [layout, colorOf, picked, columnTitles.join("|")]);

  const edges: Edge<RibbonData>[] = useMemo(
    () =>
      layout.links.map((l) => {
        const group = [l.source, l.target].find((id) => id.startsWith("group:"));
        return {
          id: l.id, source: l.source, target: l.target, type: "ribbon",
          data: { path: l.path, color: group ? colorOf.get(group)! : GREY, picked: picked === l.id },
          ariaLabel: `${nameOf(l.source)} and ${nameOf(l.target)}, ${l.value} aircraft`,
        };
      }),
    [layout, colorOf, picked],
  );

  function nameOf(id: string) {
    return flow.nodes.find((n) => n.id === id)?.name ?? id;
  }

  const selection: ExploreSelection = useMemo(() => {
    const node = flow.nodes.find((n) => n.id === picked);
    if (node) return { title: node.name, context: columnTitles[node.column] === "All" ? "All aircraft" : columnTitles[node.column], ids: node.ids };
    const link = flow.links.find((l) => l.id === picked);
    if (link) {
      const s = flow.nodes.find((n) => n.id === link.source)!, t = flow.nodes.find((n) => n.id === link.target)!;
      // A link from "All" or a Military/Civil bar is just its target narrowed to that use.
      return { title: s.column === 0 ? t.name : `${s.name} × ${t.name}`, context: `${columnTitles[s.column]} × ${columnTitles[t.column]}`, ids: link.ids };
    }
    const all = flow.nodes.find((n) => n.id === "all")!;
    return { title: all.name, context: "All aircraft", ids: all.ids };
  }, [flow, picked, columnTitles.join("|")]);

  const accent = useMemo(() => {
    const group = [picked, ...picked.split(">")].find((id) => id.startsWith("group:"));
    return group && colorOf.get(group) !== GREY ? colorOf.get(group)! : "#185fa5";
  }, [picked, colorOf]);
  const pack = useMemo(() => buildExplorePack(data, selection, accent), [data, selection, accent]);
  const members = useMemo(() => data.aircraft.filter((a) => selection.ids.includes(a.id)), [data, selection]);

  // A changed grouping makes old picks meaningless.
  useEffect(() => setPicked("all"), [groupBy, last]);

  const onSelectionChange = ({ nodes: ns, edges: es }: OnSelectionChangeParams) => {
    const next = ns.find((n) => n.type === "bar")?.id ?? es[0]?.id;
    if (next) setPicked(next);
  };

  const short = members.length < data.minAircraft;
  const perRound = Math.min(data.questionsPerRound, members.length);
  return (
    <div className="explore">
      <div className="explore-toolbar">
        <h1 className="explore-title">
          Explore aircraft <span>{data.aircraft.length} aircraft</span>
        </h1>
        <div className="explore-controls">
          <label htmlFor="explore-group">Group by</label>
          <select id="explore-group" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
              <option key={k} value={k} disabled={!canGroupBy(data, k)}>
                {GROUP_BY_LABELS[k]}
                {canGroupBy(data, k) ? "" : " (coming soon)"}
              </option>
            ))}
          </select>
          <label htmlFor="explore-last">then</label>
          <select id="explore-last" value={last} onChange={(e) => setLast(e.target.value as LastColumn)}>
            {(Object.keys(LAST_COLUMN_LABELS) as LastColumn[]).map((k) => (
              <option key={k} value={k}>{LAST_COLUMN_LABELS[k]}</option>
            ))}
          </select>
          <button className="icon-btn" onClick={onBrowse}>Browse all sets</button>
        </div>
      </div>

      <div className="explore-body">
        <div className="explore-chart" ref={chartRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onSelectionChange={onSelectionChange}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            zoomOnScroll={false}
            preventScrolling={false}
            fitView
            fitViewOptions={{ padding: 0.04 }}
            minZoom={0.4}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <aside className="explore-panel" style={{ ["--accent" as string]: accent }} aria-live="polite">
          <p className="explore-context">{selection.context}</p>
          <h2 className="explore-pick">{selection.title}</h2>
          <p className="explore-stat">
            {members.length} aircraft{short ? "" : ` · ${perRound} per round`}
          </p>
          {short && <p className="explore-note">Needs {data.minAircraft - members.length} more aircraft to play (sets need {data.minAircraft}).</p>}
          <ul className="explore-list">
            {members.slice(0, 8).map((a) => (
              <li key={a.id}>{a.label}</li>
            ))}
            {members.length > 8 && <li className="explore-more">and {members.length - 8} more</li>}
          </ul>
          <div className="preview-actions">
            <button className={mode === "play" ? "next-btn" : "secondary-btn"} disabled={!pack} onClick={() => pack && onPlay(pack)}>
              Play
            </button>
            <button className={mode === "study" ? "next-btn" : "secondary-btn"} disabled={!pack} onClick={() => pack && onStudy(pack)}>
              Study
            </button>
          </div>
          <p className="explore-hint">Pick a bar, or a ribbon for the overlap of two bars.</p>
        </aside>
      </div>
    </div>
  );
}
