import { useEffect, useRef, useState } from "react";
import { THEME_IDS, THEME_SWATCHES, themeLabel, type ThemeId } from "@bc/companion-shared";

/**
 * Accessible theme picker matching the CRM's swatch + label + selected styling,
 * as a compact custom dropdown/listbox (the popover has no room for the CRM's
 * flat pill row). Presentation-only; applies the theme immediately and closes.
 *
 * A11y: trigger is a combobox (aria-haspopup=listbox, aria-expanded); the list is
 * role=listbox with role=option children and aria-selected. Arrow keys move the
 * active option, Enter/Space select, Escape closes (without closing the parent
 * popover), outside-click closes.
 */
export function ThemeSelect({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, THEME_IDS.indexOf(value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, THEME_IDS.indexOf(value)));
      listRef.current?.focus();
    }
  }, [open, value]);

  function selectAt(i: number) {
    onChange(THEME_IDS[i]);
    setOpen(false);
  }

  function onTriggerKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onListKey(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => Math.min(a + 1, THEME_IDS.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(THEME_IDS.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectAt(active);
        break;
      case "Escape":
        // Close ONLY the listbox — don't let the popover's Escape handler fire.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div className="bc-tsel" ref={rootRef}>
      <button
        type="button"
        className="bc-tsel-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${themeLabel(value)}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKey}
      >
        <span className="bc-tsel-swatch" style={{ background: THEME_SWATCHES[value] }} />
        <span className="bc-tsel-name">{themeLabel(value)}</span>
        <svg className="bc-tsel-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          className="bc-tsel-list"
          role="listbox"
          tabIndex={-1}
          aria-label="Theme"
          aria-activedescendant={`bc-topt-${THEME_IDS[active]}`}
          onKeyDown={onListKey}
        >
          {THEME_IDS.map((id, i) => {
            const selected = id === value;
            return (
              <li
                key={id}
                id={`bc-topt-${id}`}
                role="option"
                aria-selected={selected}
                className={`bc-tsel-opt${selected ? " is-selected" : ""}${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => selectAt(i)}
              >
                <span className="bc-tsel-swatch" style={{ background: THEME_SWATCHES[id] }} />
                <span className="bc-tsel-name">{themeLabel(id)}</span>
                {selected && (
                  <svg className="bc-tsel-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 12l5 5L20 6" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
