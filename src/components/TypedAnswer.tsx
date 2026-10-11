import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { fuzzySearch, sameName } from "../engine/names";

interface TypedAnswerProps {
  /** Every name across every pack; suggestions are drawn from here. */
  names: readonly string[];
  /** Display label of the correct answer, used to colour the locked state. */
  correctLabel: string;
  /** The name the player submitted, once they have. */
  answered: string | null;
  locked: boolean;
  onSubmit: (name: string) => void;
}

export function TypedAnswer({ names, correctLabel, answered, locked, onSubmit }: TypedAnswerProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  const suggestions = useMemo(() => fuzzySearch(query, names, 6), [query, names]);

  const submit = (name: string) => {
    if (locked) return;
    setQuery(name);
    onSubmit(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (suggestions.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      const pick = suggestions[active];
      if (pick) submit(pick);
    } else if (e.key === "Escape") {
      setQuery("");
      setActive(0);
    } else {
      return;
    }
    e.preventDefault();
  };

  let state = "";
  if (locked) {
    if (answered && sameName(answered, correctLabel)) state = " correct";
    else if (answered) state = " wrong";
  }

  const open = !locked && suggestions.length > 0;

  return (
    <div className="typed">
      <input
        className={`typed-input${state}`}
        type="text"
        value={locked ? answered ?? "" : query}
        placeholder={locked ? "No answer" : "Type a name…"}
        disabled={locked}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-label="Your answer"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="typed-list" id={listId} role="listbox">
          {suggestions.map((name, i) => (
            <li
              key={name}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`typed-option${i === active ? " active" : ""}`}
              onMouseEnter={() => setActive(i)}
              // mousedown, not click, so the input doesn't blur first
              onMouseDown={(e) => {
                e.preventDefault();
                submit(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
      {!locked && query.trim() !== "" && suggestions.length === 0 && (
        <p className="typed-empty">No matching names.</p>
      )}
    </div>
  );
}
