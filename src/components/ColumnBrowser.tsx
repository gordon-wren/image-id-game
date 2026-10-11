import { useEffect, useRef, type KeyboardEvent } from "react";
import type { QuestionPack } from "../engine/types";
import {
  type CategoryNode,
  countPacks,
  nodeAccent,
  nodeChain,
} from "../engine/categories";
import { getHighScore } from "../engine/highScores";
import { formatSeconds, roundSeconds, type TimerSetting } from "../engine/timerSetting";
import type { AnswerMode } from "../engine/useAnswerMode";
import type { PlayMode } from "../engine/usePlayMode";

/** What's selected: a chain of folder ids, plus optionally a pack in the last folder. */
export interface BrowserSelection {
  path: string[];
  packId?: string;
}

interface ColumnBrowserProps {
  root: CategoryNode;
  selection: BrowserSelection;
  onSelect: (selection: BrowserSelection) => void;
  /** Whether opening a pack plays the game or studies it as flashcards. */
  mode: PlayMode;
  /** Opens the pack in the current mode (Play button, Enter or double-click). */
  onStart: (pack: QuestionPack) => void;
  /** Shown in the pack preview as the time per round. */
  timer: TimerSetting;
  answerMode: AnswerMode;
}

type Entry =
  | { kind: "folder"; key: string; node: CategoryNode }
  | { kind: "pack"; key: string; pack: QuestionPack };

function entriesOf(node: CategoryNode): Entry[] {
  return [
    ...node.children.map((n): Entry => ({ kind: "folder", key: `f:${n.id}`, node: n })),
    ...node.packs.map((p): Entry => ({ kind: "pack", key: `p:${p.id}`, pack: p })),
  ];
}

export function ColumnBrowser({ root, selection, onSelect, mode, onStart, timer, answerMode }: ColumnBrowserProps) {
  const chain = nodeChain(root, selection.path);
  // Ignore stale ids so the columns always reflect a real position in the tree.
  const path = chain.slice(1).map((n) => n.id);
  const last = chain[chain.length - 1];
  const pack = selection.packId
    ? last.packs.find((p) => p.id === selection.packId)
    : undefined;

  const columnsRef = useRef<HTMLDivElement>(null);
  const focusKeyRef = useRef<string | null>(null);

  // Keep the newest column in view, like Finder does.
  useEffect(() => {
    const el = columnsRef.current;
    if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [path.length, pack?.id]);

  // After a keyboard move, move DOM focus onto the newly selected row.
  useEffect(() => {
    const key = focusKeyRef.current;
    if (!key) return;
    focusKeyRef.current = null;
    columnsRef.current
      ?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
      ?.focus();
  });

  const select = (column: number, entry: Entry, fromKeyboard = false) => {
    if (fromKeyboard) focusKeyRef.current = `${column}:${entry.key}`;
    const base = path.slice(0, column);
    onSelect(
      entry.kind === "folder"
        ? { path: [...base, entry.node.id] }
        : { path: base, packId: entry.pack.id },
    );
  };

  // The column holding the deepest selected row, and that row's index.
  const focused = (() => {
    if (pack) {
      const col = chain.length - 1;
      return { col, index: entriesOf(last).findIndex((e) => e.key === `p:${pack.id}`) };
    }
    if (path.length > 0) {
      const col = chain.length - 2;
      return { col, index: entriesOf(chain[col]).findIndex((e) => e.key === `f:${last.id}`) };
    }
    return { col: 0, index: -1 };
  })();

  const onKeyDown = (e: KeyboardEvent) => {
    const { col, index } = focused;
    const entries = entriesOf(chain[col]);
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (entries.length === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = index < 0 ? 0 : Math.min(entries.length - 1, Math.max(0, index + step));
        select(col, entries[next], true);
        break;
      }
      case "ArrowRight": {
        if (pack || path.length === 0) return;
        const inner = entriesOf(last);
        if (inner.length > 0) select(col + 1, inner[0], true);
        break;
      }
      case "ArrowLeft": {
        if (col === 0) return;
        const parent = chain[col];
        focusKeyRef.current = `${col - 1}:f:${parent.id}`;
        onSelect({ path: path.slice(0, col) });
        break;
      }
      case "Enter":
        if (pack) onStart(pack);
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const currentColumn = pack ? chain.length : chain.length - 1;

  return (
    <div className="browser">
      <nav className="crumbs" aria-label="Category path">
        {chain.map((node, i) => (
          <span key={i} className="crumb">
            {i > 0 && <span className="crumb-sep" aria-hidden>›</span>}
            <button
              className="crumb-btn"
              disabled={i === chain.length - 1 && !pack}
              onClick={() => onSelect({ path: path.slice(0, i) })}
            >
              {i === 0 ? "All" : node.title}
            </button>
          </span>
        ))}
        {pack && (
          <span className="crumb">
            <span className="crumb-sep" aria-hidden>›</span>
            <span className="crumb-btn" aria-current="page">{pack.title}</span>
          </span>
        )}
      </nav>

      <div className="columns" ref={columnsRef} onKeyDown={onKeyDown}>
        {chain.map((node, col) => (
          <div
            key={col}
            className={`col${col === currentColumn ? " current" : ""}`}
            role="listbox"
            aria-label={col === 0 ? "Categories" : node.title}
          >
            {entriesOf(node).map((entry) => {
              const selected =
                entry.kind === "folder"
                  ? path[col] === entry.node.id
                  : col === chain.length - 1 && pack?.id === entry.pack.id;
              const accent =
                entry.kind === "folder" ? nodeAccent(entry.node) : entry.pack.theme.accent;
              return (
                <button
                  key={entry.key}
                  data-key={`${col}:${entry.key}`}
                  className={`col-row${selected ? " selected" : ""}`}
                  role="option"
                  aria-selected={selected}
                  style={accent ? { ["--accent" as string]: accent } : undefined}
                  onClick={() => select(col, entry)}
                  onDoubleClick={() => entry.kind === "pack" && onStart(entry.pack)}
                >
                  <span className="col-dot" aria-hidden />
                  <span className="col-label">
                    {entry.kind === "folder" ? entry.node.title : entry.pack.title}
                  </span>
                  {entry.kind === "folder" ? (
                    <>
                      <span className="col-count">{countPacks(entry.node)}</span>
                      <span className="col-chevron" aria-hidden>›</span>
                    </>
                  ) : (
                    <span className="col-tag">Play</span>
                  )}
                </button>
              );
            })}
            {col === 0 && node.children.length === 0 && node.packs.length === 0 && (
              <p className="col-empty">No games yet.</p>
            )}
            {col > 0 && col === chain.length - 1 && !pack && node.description && (
              <p className="col-note">{node.description}</p>
            )}
          </div>
        ))}

        {pack && (
          <PackPreview
            pack={pack}
            current={currentColumn === chain.length}
            mode={mode}
            onStart={onStart}
            perRound={timer === "off" ? "No limit" : formatSeconds(roundSeconds(pack, timer, answerMode))}
          />
        )}
      </div>
    </div>
  );
}

function PackPreview({
  pack,
  current,
  mode,
  onStart,
  perRound,
}: {
  pack: QuestionPack;
  current: boolean;
  mode: PlayMode;
  onStart: (pack: QuestionPack) => void;
  perRound: string;
}) {
  const hs = getHighScore(pack.id);
  return (
    <div
      className={`col col-preview${current ? " current" : ""}`}
      style={{ ["--accent" as string]: pack.theme.accent }}
    >
      <div className="preview-head">
        <span className="mode-dot" aria-hidden />
        <p className="pack-title">{pack.title}</p>
      </div>
      {pack.description && <p className="pack-desc">{pack.description}</p>}
      {mode === "study" ? (
        <dl className="preview-meta">
          <div><dt>Cards</dt><dd>{pack.questions.length}</dd></div>
          <div><dt>Timer</dt><dd>None</dd></div>
        </dl>
      ) : (
        <dl className="preview-meta">
          <div><dt>Questions</dt><dd>{pack.questions.length}</dd></div>
          <div><dt>Per round</dt><dd>{perRound}</dd></div>
          <div><dt>Best</dt><dd>{hs !== null ? `★ ${hs.toLocaleString()}` : "—"}</dd></div>
        </dl>
      )}
      <button
        className="next-btn"
        onClick={() => onStart(pack)}
        aria-label={mode === "study" ? `Study ${pack.title} with flashcards` : undefined}
      >
        {mode === "study" ? "Study" : "Play"}
      </button>
    </div>
  );
}
