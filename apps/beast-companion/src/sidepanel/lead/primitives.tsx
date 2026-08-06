import { useState, type ReactNode } from "react";
import { LEAD_STAGE_LABELS, LEAD_STAGE_TONE, type LeadStage } from "@bc/companion-shared";

/**
 * Panel primitives — the Companion re-implementation of the CRM lead panel's
 * SectionCard / Field / badges / buttons. Plain React + `--lb-*` semantic tokens
 * (no Tailwind, no copied CRM stylesheet). Matches the CRM card/accordion/badge/
 * button language.
 */

export function SectionCard({
  title,
  children,
  defaultOpen = true,
  shaded = false,
  collapsible = true,
  right,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  shaded?: boolean;
  collapsible?: boolean;
  right?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`lp-section${shaded ? " is-shaded" : ""}`}>
      <button
        type="button"
        className="lp-section-head"
        aria-expanded={open}
        onClick={() => collapsible && setOpen((o) => !o)}
        disabled={!collapsible}
      >
        <span className="lp-section-title">{title}</span>
        {right}
        {collapsible && (
          <svg
            className={`lp-chevron${open ? " is-open" : ""}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        )}
      </button>
      {open && <div className="lp-section-body">{children}</div>}
    </section>
  );
}

// A single label/value row. Callers only render a Field when the value is
// meaningful (see FieldSection), so there is no empty-state dash here — an
// uncollected field is omitted entirely, never shown as "—".
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="lp-field">
      <span className="lp-field-label">{label}</span>
      <span className="lp-field-value">{value}</span>
    </div>
  );
}

export function StageBadge({ stage }: { stage: LeadStage }) {
  return (
    <span className={`lp-badge tone-${LEAD_STAGE_TONE[stage]}`}>{LEAD_STAGE_LABELS[stage]}</span>
  );
}

export function StatusPill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "danger" | "accent";
}) {
  return <span className={`lp-status tone-${tone}`}>{children}</span>;
}

export function Button({
  children,
  variant = "soft",
  onClick,
  disabled,
  title,
  ariaLabel,
  full,
}: {
  children: ReactNode;
  variant?: "solid" | "soft" | "ghost" | "dashed";
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  full?: boolean;
}) {
  return (
    <button
      type="button"
      className={`lp-btn v-${variant}${full ? " is-full" : ""}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}
