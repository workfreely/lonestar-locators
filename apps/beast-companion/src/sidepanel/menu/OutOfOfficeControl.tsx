import { useEffect, useRef, useState } from "react";
import { formatDateDisplay } from "@bc/companion-shared";
import { useOutOfOffice } from "./useOutOfOffice";

/**
 * OUT OF OFFICE — the locator's own away switch, as a view inside the Companion
 * menu popover.
 *
 * A view rather than a floating modal on purpose: the panel is ~384px wide and
 * lives inside a Shadow DOM host, so a second overlay layer would mean a second
 * z-index/backdrop story for no benefit. Replacing the popover's contents (with a
 * back affordance) reads as a modal, reuses the backdrop and Escape handling the
 * menu already has, and cannot end up half-off-screen.
 *
 * ── WHAT THE LOCATOR IS BEING TOLD ──────────────────────────────────────────
 * The status line is the point of this control. "Out of Office" is a state a
 * locator can forget they are in, and the cost of forgetting is real: new leads
 * stop being greeted automatically. So the state is stated in words, not left to
 * be inferred from a toggle's position, and it is re-read from the server every
 * time this opens rather than remembered.
 *
 * The copy also says what being away does and does not do, because the natural
 * assumption — that this pauses everything — is wrong and would be a bad surprise
 * in both directions.
 */

/** Today in the LOCAL calendar, as YYYY-MM-DD — the date input's floor.
 *  Built from local parts, never toISOString(), which would shift the day for
 *  anyone behind UTC after 6–7pm and offer a "min" of yesterday. */
function todayLocalIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function OutOfOfficeControl({ onBack }: { onBack: () => void }) {
  const ooo = useOutOfOffice(true);
  const backRef = useRef<HTMLButtonElement>(null);

  // The date field is a DRAFT: typing a date must not save on every keystroke,
  // and a half-typed "2026-1" must not be sent. It is committed on blur/Save, or
  // immediately when the toggle is flipped (so one tap can mean "away until the
  // 20th" without a second confirm).
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    // Adopt the server value whenever it arrives, unless the locator is mid-edit.
    if (!dirty) setDraft(ooo.until ?? "");
  }, [ooo.until, dirty]);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  const busy = ooo.status === "loading" || ooo.status === "saving";
  const unreachable = ooo.status === "unreachable";

  function commitDate() {
    if (!dirty) return;
    setDirty(false);
    // "" means the locator cleared the field — an explicit null, not an omission.
    ooo.save({ enabled: ooo.enabled, until: draft === "" ? null : draft });
  }

  function toggle() {
    const next = !ooo.enabled;
    // A pending date edit rides along with the flip so the two cannot disagree.
    if (dirty) {
      setDirty(false);
      ooo.save({ enabled: next, until: draft === "" ? null : draft });
    } else {
      // No `until` key — the stored return date is preserved, including when
      // turning OFF. Coming back early should not erase next week's date.
      ooo.save({ enabled: next });
    }
  }

  return (
    <div className="bc-ooo">
      <div className="bc-ooo-head">
        <button ref={backRef} type="button" className="bc-ooo-back" onClick={onBack} aria-label="Back to menu">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="bc-ooo-title">Out of Office</span>
      </div>

      {unreachable ? (
        // Not an error the locator caused, and not something a retry inside the
        // panel can fix — the authenticated call has to be made by the CRM page.
        // Say which window to open rather than showing a dead toggle.
        <div className="bc-ooo-body">
          <p className="bc-ooo-note">
            Open your Locator Beast CRM tab to change this. Out of Office is saved to your
            workspace, and the Companion needs that signed-in tab to read or update it.
          </p>
          <button type="button" className="bc-ooo-retry" onClick={ooo.refresh}>
            Try again
          </button>
        </div>
      ) : (
        <div className="bc-ooo-body">
          {/* STATUS — stated in words, from the server, every open. */}
          <div className={`bc-ooo-status${ooo.enabled ? " is-on" : ""}`} aria-live="polite">
            <span className={`bc-ooo-dot${ooo.enabled ? " is-on" : ""}`} aria-hidden />
            {ooo.status === "loading" ? (
              <span>Checking…</span>
            ) : ooo.enabled ? (
              <span>
                You’re marked <strong>away</strong>
                {ooo.until ? <> until {formatDateDisplay(ooo.until)}</> : null}
              </span>
            ) : (
              <span>
                You’re <strong>in the office</strong>
              </span>
            )}
          </div>

          <div className="bc-ooo-row">
            <span className="bc-ooo-label">Out of Office</span>
            <button
              type="button"
              role="switch"
              aria-checked={ooo.enabled}
              aria-label="Out of Office"
              className={`bc-toggle${ooo.enabled ? " is-on" : ""}`}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              <span className="bc-toggle-knob" aria-hidden />
            </button>
          </div>

          <div className="bc-ooo-row">
            <label className="bc-ooo-label" htmlFor="bc-ooo-until">
              Return date
            </label>
            <input
              id="bc-ooo-until"
              type="date"
              className="bc-ooo-date"
              value={draft}
              min={todayLocalIso()}
              disabled={busy}
              onChange={(e) => {
                setDirty(true);
                setDraft(e.target.value);
              }}
              onBlur={commitDate}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDate();
                }
                // Escape here would otherwise close the whole popover mid-edit.
                if (e.key === "Escape") e.stopPropagation();
              }}
            />
          </div>
          <p className="bc-ooo-hint">
            Optional. Shown on your public page as the day you’re back.
          </p>

          {/* What this actually does — the assumption worth correcting. */}
          <p className="bc-ooo-note">
            While you’re away, new leads can still submit your form, but they won’t get the
            automatic opening texts. Clients already in progress are unaffected. Start each
            held lead yourself from the board when you’re back.
          </p>

          {ooo.previewUrl && (
            <a
              className="bc-ooo-preview"
              href={ooo.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Preview Out of Office Page
            </a>
          )}
          {ooo.error && <p className="bc-ooo-err">Couldn’t save. Try again.</p>}
        </div>
      )}
    </div>
  );
}
