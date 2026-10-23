import { useEffect, useRef, useState } from "react";
import type { QuestionPack } from "../engine/types";
import { isAbsoluteUrl, withBase } from "../engine/pack";
import {
  formatNumber,
  isCaught,
  packEntries,
  progress,
  type Catalog,
  type CollectionRecord,
} from "../engine/collection";

type Filter = "all" | "caught" | "missing";

interface CollectionProps {
  catalog: Catalog;
  record: CollectionRecord;
  /** Every loaded pack, in menu order; sections follow this order. */
  packs: QuestionPack[];
  /** Marks a caught entry's detail card as opened (clears its New tag). */
  onView: (key: string) => void;
  onReset: () => void;
}

const imageUrl = (path: string) => (isAbsoluteUrl(path) ? path : withBase(path));
const percent = ({ caught, total }: { caught: number; total: number }) =>
  total ? Math.round((caught / total) * 100) : 0;

export function Collection({ catalog, record, packs, onView, onReset }: CollectionProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const allKeys = Object.keys(catalog.entries);
  const overall = progress(record, allKeys);
  const packTitles = new Map(packs.map((p) => [p.id, p.title]));
  const shown = (key: string) =>
    filter === "all" || (filter === "caught") === isCaught(record, key);

  const reset = () => {
    if (window.confirm("Reset your collection? This clears every catch and can't be undone.")) onReset();
  };

  return (
    <div className="collection">
      <div className="collection-head">
        <h1 className="collection-title">Collection</h1>
        <p className="collection-total">
          {overall.caught} / {overall.total} caught ({percent(overall)}%)
        </p>
        <div className="timer-track" aria-hidden="true">
          <div className="timer-fill" style={{ width: `${percent(overall)}%`, background: "var(--text)" }} />
        </div>
        <div className="collection-filter" role="group" aria-label="Show">
          {(["all", "caught", "missing"] as const).map((f) => (
            <button
              key={f}
              className={`icon-btn${filter === f ? " active" : ""}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "caught" ? "Caught" : "Missing"}
            </button>
          ))}
        </div>
      </div>

      {packs.map((pack) => {
        const keys = packEntries(catalog, pack.id);
        const visible = keys.filter(shown);
        if (keys.length === 0 || visible.length === 0) return null;
        const p = progress(record, keys);
        return (
          <section
            key={pack.id}
            className="collection-section"
            style={{ ["--accent" as string]: pack.theme.accent }}
            aria-labelledby={`collection-${pack.id}`}
          >
            <div className="collection-section-head">
              <h2 id={`collection-${pack.id}`}>{pack.title}</h2>
              <span className="collection-count">
                {p.caught}/{p.total} ({percent(p)}%)
              </span>
            </div>
            <div className="timer-track" aria-hidden="true">
              <div className="timer-fill" style={{ width: `${percent(p)}%`, background: "var(--accent)" }} />
            </div>
            <div className="collection-grid">
              {visible.map((key) => {
                const entry = catalog.entries[key];
                const caught = isCaught(record, key);
                const isNew = caught && !record.entries[key]?.viewed;
                return (
                  <button
                    key={key}
                    className={`dex-card${caught ? "" : " uncaught"}`}
                    onClick={() => setOpen(key)}
                    aria-label={`${formatNumber(entry.number)} ${entry.name}${caught ? "" : ", not caught yet"}${isNew ? ", new" : ""}`}
                  >
                    <div className="dex-thumb">
                      {caught ? (
                        <img src={imageUrl(entry.image)} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="dex-placeholder" aria-hidden="true">?</span>
                      )}
                      {isNew && <span className="dex-new">New</span>}
                    </div>
                    <span className="dex-number">{formatNumber(entry.number)}</span>
                    <span className="dex-name">{entry.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {filter !== "all" && packs.every((pack) => !packEntries(catalog, pack.id).some(shown)) && (
        <p className="state-msg">{filter === "caught" ? "Nothing caught yet. Play a pack to start!" : "Every aircraft caught!"}</p>
      )}

      <button className="icon-btn collection-reset" onClick={reset}>
        Reset collection
      </button>

      {open && (
        <DetailCard
          entryKey={open}
          catalog={catalog}
          record={record}
          packTitles={packTitles}
          onView={onView}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function DetailCard({
  entryKey,
  catalog,
  record,
  packTitles,
  onView,
  onClose,
}: {
  entryKey: string;
  catalog: Catalog;
  record: CollectionRecord;
  packTitles: Map<string, string>;
  onView: (key: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const entry = catalog.entries[entryKey];
  const progressEntry = record.entries[entryKey];
  const caught = isCaught(record, entryKey);
  const inPacks = entry.packs.map((id) => packTitles.get(id) ?? id).join(", ");

  // A native modal dialog gives focus trapping and Escape-to-close for free.
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
    if (caught) onView(entryKey);
  }, [entryKey, caught, onView]);

  const f = entry.facts;
  const facts: [string, string | number | null | undefined][] = f
    ? [
        ["Role", f.role],
        ["Manufacturer", f.manufacturer],
        ["First flight", f.firstFlight],
        ["Country", f.country],
        ["NATO name", f.natoName?.toUpperCase()],
      ]
    : [];

  return (
    <dialog
      ref={ref}
      className="dex-detail"
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside its content) closes it.
      onClick={(e) => e.target === ref.current && ref.current.close()}
      aria-labelledby="dex-detail-name"
    >
      <div className="dex-detail-body">
        <button className="icon-btn dex-detail-close" onClick={() => ref.current?.close()} aria-label="Close">
          Close
        </button>
        {caught && <img className="dex-detail-img" src={imageUrl(entry.image)} alt={entry.name} />}
        <p className="dex-number">{formatNumber(entry.number)}</p>
        <h2 id="dex-detail-name" className="dex-detail-name">{entry.name}</h2>

        {!caught ? (
          <>
            <p className="dex-locked">Not caught yet</p>
            <p className="dex-detail-meta">Find it in: {inPacks}</p>
          </>
        ) : (
          <>
            {f?.description && <p className="dex-detail-desc">{f.description}</p>}
            {entry.caption && <p className="dex-detail-desc">{entry.caption}</p>}
            {facts.some(([, v]) => v != null) && (
              <dl className="preview-meta dex-facts">
                {facts
                  .filter(([, v]) => v != null)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            )}
            {f?.about && (
              <p className="dex-about">
                {f.about}{" "}
                {f.wikipedia && (
                  <a href={f.wikipedia} target="_blank" rel="noreferrer">
                    From Wikipedia
                  </a>
                )}
              </p>
            )}
            <p className="dex-detail-meta">
              In: {inPacks}
              {progressEntry?.firstCaughtAt && (
                <> · First caught {new Date(progressEntry.firstCaughtAt).toLocaleDateString()}</>
              )}
              <br />
              Seen {progressEntry?.seen ?? 0} · Correct {progressEntry?.correct ?? 0}
            </p>
            {entry.credit && <p className="result-credit">Photo: {entry.credit}</p>}
          </>
        )}
      </div>
    </dialog>
  );
}
