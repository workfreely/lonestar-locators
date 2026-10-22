import { useEffect, useMemo, useRef, useState } from "react";
import {
  VOICEMAIL_TEMPLATE_LABELS,
  SAVEABLE_VOICEMAIL_KEYS,
  chooseTemplate,
  pickPreferences,
  renderVoicemail,
  mustHaveAmenityLabel,
  formatPersonName,
  formatPhone,
  type LeadSummaryDTO,
  type VoicemailTemplateKey,
} from "@bc/companion-shared";
import "./voicemail.css";

/**
 * VOICEMAIL SCRIPT — a full-panel reading view the locator keeps open while dialling.
 *
 * AGENT-ONLY, and inert by construction. It renders text and copies text. It cannot place a call,
 * send a message, enrol anyone in automation, book a tour or move a stage: the only outbound
 * things it does are the two verbs below, which write one jsonb column on the lead.
 *
 * A full panel rather than the bottom sheet the task editor uses, because a sheet is modal — it
 * would cover the client while the locator is on the phone with them, which is exactly when this
 * needs to stay readable.
 */
export function VoicemailScriptView({
  lead,
  saved,
  onClose,
  onSave,
  onReset,
  onContact,
}: {
  lead: LeadSummaryDTO;
  saved?: { templateKey: string; body: string; specialsEnabled?: boolean | null } | null;
  onClose: () => void;
  onSave: (payload: { templateKey: VoicemailTemplateKey; body: string; specialsEnabled: boolean }) => void;
  onReset: () => void;
  /** The panel's EXISTING call/text handler — the same one the Call Client button uses. */
  onContact?: (method: "call" | "text") => void;
}) {
  const choice = useMemo(() => chooseTemplate(lead.searchCriteria?.moveDate ?? null), [lead.searchCriteria?.moveDate ?? null]);

  // The saved script's template wins — reopening must show what was saved, not what today's move
  // date would pick. Otherwise the automatic choice; when there isn't one the locator picks.
  const [templateKey, setTemplateKey] = useState<VoicemailTemplateKey | "">(
    (saved?.templateKey as VoicemailTemplateKey | undefined) ?? choice.key ?? "",
  );
  const [specialsEnabled, setSpecialsEnabled] = useState(saved?.specialsEnabled === true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const prefs = useMemo(
    () =>
      pickPreferences({
        mustHaveAmenities: lead.searchCriteria?.mustHaveAmenities ?? null,
        aiInsights: lead.aiInsights ?? null,
        clientNotes: lead.clientNotes ?? null,
        locatorNotes: lead.locatorNotes ?? null,
        amenityLabel: mustHaveAmenityLabel,
      }),
    [lead.searchCriteria?.mustHaveAmenities, lead.aiInsights, lead.clientNotes, lead.locatorNotes],
  );

  const rendered = useMemo(() => {
    if (!templateKey) return "";
    return renderVoicemail(templateKey, {
      firstName: lead.firstName,
      moveDate: lead.searchCriteria?.moveDate ?? null,
      preferences: prefs.values,
      includeSpecials: specialsEnabled,
    });
  }, [templateKey, lead.firstName, lead.searchCriteria?.moveDate ?? null, prefs.values, specialsEnabled]);

  // A SAVED script is the locator's own words and is shown verbatim. It is replaced only when they
  // save again or reset — never because the client's data changed underneath it.
  const isSavedForThisTemplate = !!saved && saved.templateKey === templateKey;
  const body = editing ? draft : isSavedForThisTemplate ? saved!.body : rendered;

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  const clientName = formatPersonName(lead.firstName ?? "") || "This client";
  const lastName = formatPersonName(lead.lastName ?? "");
  // Display only — the DTO's raw phone is never altered.
  const phoneDisplay = lead.phone ? formatPhone(lead.phone) : "";

  // CLOSING WITH AN EDIT OPEN. The draft lives in component state, so leaving would drop it
  // silently. Ask instead — and only when there is actually something to lose.
  function requestClose() {
    if (editing && draft.trim() && draft !== (isSavedForThisTemplate ? saved!.body : rendered)) {
      const keep = window.confirm("You have unsaved changes to this script.\n\nOK to discard them and close, or Cancel to keep editing.");
      if (!keep) return;
    }
    onClose();
  }

  function startEditing() {
    setDraft(body);
    setEditing(true);
  }
  function commit() {
    if (!templateKey) return;
    onSave({ templateKey, body: draft.trim() || rendered, specialsEnabled });
    setEditing(false);
    setSavedTick(true);
    window.setTimeout(() => setSavedTick(false), 1800);
  }
  function copy() {
    void navigator.clipboard?.writeText(body).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <div className="vm-wrap">
      <div className="vm-head">
        <span className="vm-title">Voicemail Script</span>
        <button type="button" className="vm-x" onClick={requestClose} aria-label="Close voicemail script">✕</button>
      </div>

      {/* Name and number stay PINNED above the scrolling script, so the number is still there to
          read off or dial by hand halfway down a long message. */}
      <div className="vm-client">
        <span className="vm-name">{[clientName, lastName].filter(Boolean).join(" ")}</span>
        {/* The SAME handler the Call Client button uses — no second calling path, and no call is
            ever placed by opening this view. Rendered only when there is a number to call. */}
        {phoneDisplay && onContact && (
          <button type="button" className="vm-phone" onClick={() => onContact("call")} title={`Call ${clientName}`}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
            </svg>
            {phoneDisplay}
          </button>
        )}
        {phoneDisplay && !onContact && <span className="vm-phone-plain">{phoneDisplay}</span>}
      </div>

      <label className="vm-label" htmlFor="vm-template">Template</label>
      <select
        id="vm-template"
        className="vm-select"
        value={templateKey}
        onChange={(e) => { setTemplateKey(e.target.value as VoicemailTemplateKey); setEditing(false); }}
      >
        {/* No move date, or a move inside 30 days: neither approved script fits, so the locator
            chooses rather than being handed one that reads wrong. */}
        {!templateKey && (
          <option value="">
            {choice.automatic ? "Select a template" :
              choice.reason === "no_move_date" ? "No move date — choose a template" : "Moving soon — choose a template"}
          </option>
        )}
        {SAVEABLE_VOICEMAIL_KEYS.map((k) => (
          <option key={k} value={k}>{VOICEMAIL_TEMPLATE_LABELS[k]}</option>
        ))}
      </select>
      <p className="vm-soon">{VOICEMAIL_TEMPLATE_LABELS.pre_tour}</p>

      <div className="vm-rowhead">
        <span className="vm-label">Your voicemail</span>
        <div className="vm-seg" role="group" aria-label="Read or edit">
          <button type="button" className={`vm-segbtn${!editing ? " is-on" : ""}`} onClick={() => setEditing(false)}>Read</button>
          <button type="button" className={`vm-segbtn${editing ? " is-on" : ""}`} onClick={startEditing} disabled={!templateKey}>Edit</button>
        </div>
      </div>

      {templateKey ? (
        editing ? (
          <textarea ref={taRef} className="vm-body vm-body--edit" value={draft} onChange={(e) => setDraft(e.target.value)} />
        ) : (
          <div className="vm-body" role="article" aria-label="Voicemail script">{body}</div>
        )
      ) : (
        <p className="vm-empty">Choose a template to see the script.</p>
      )}

      {/* The specials paragraph is OFF unless the locator turns it on. Nothing the Companion can
          see verifies concessions or pricing, so it is never enabled automatically. */}
      <label className="vm-check">
        <input type="checkbox" checked={specialsEnabled} disabled={!templateKey || editing}
          onChange={(e) => setSpecialsEnabled(e.target.checked)} />
        <span>Include specials paragraph <em>— only if you've verified current specials</em></span>
      </label>

      <div className="vm-actions">
        {editing ? (
          <>
            <button type="button" className="vm-btn vm-btn--primary" onClick={commit}>Save</button>
            <button type="button" className="vm-btn" onClick={() => setEditing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button type="button" className="vm-btn vm-btn--primary" onClick={copy} disabled={!templateKey}>
              {copied ? "Copied" : "Copy Script"}
            </button>
            <button type="button" className="vm-btn" onClick={startEditing} disabled={!templateKey}>Edit</button>
            {saved && <button type="button" className="vm-btn" onClick={onReset}>Reset</button>}
          </>
        )}
      </div>

      <p className="vm-foot">
        {savedTick ? "Saved to this client." : "Agent-only reading view. Nothing is sent to the client."}
      </p>
    </div>
  );
}
