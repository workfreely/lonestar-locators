import { WASHER_DRYER_LABEL, type WasherDryerStatus } from "@/lib/leads/washerDryer"

/**
 * THE WASHER/DRYER BADGE ON A RECOMMENDED PROPERTY CARD — internal, informational, read-only.
 *
 * It exists so a locator can see what a property offers without opening Property Intelligence.
 * It is NOT an editing control: changes go through the pencil, the same as every other property
 * fact. Clicking it does nothing, on purpose.
 *
 * ── IT SAYS ONLY WHAT THE CLIENT WOULD BE TOLD ──────────────────────────────────────────────
 * The status comes from resolveWithOverride — a saved per-client confirmation first, then a
 * CONCLUSIVE catalog reading, then nothing. So the two labels it can show are exactly the two
 * the client's card can show, and the internal card never claims something the share would not.
 * "Select Units", "Specific Floor Plans" and an unanswered property resolve to null here and
 * render nothing at all: a locator seeing no badge knows the answer is not settled, which is
 * true, rather than seeing a hedge they might repeat to a renter.
 *
 * ── WHY IT IS QUIET ─────────────────────────────────────────────────────────────────────────
 * It shares the bottom row with the commission badge, which is the one a locator is scanning
 * for. So this takes the neutral panel treatment rather than a colour of its own — present when
 * you look for it, not competing with the number that pays.
 */

export default function WasherDryerBadge({ status, className = "" }: { status: WasherDryerStatus | null; className?: string }) {
  // Unknown and unsettled both render nothing. There is no "unverified" chip: a badge that says
  // nothing still occupies the row and still invites a glance.
  if (!status) return null
  // GREEN, BUT NOT *THE* GREEN. Included is the stronger of the two washer/dryer facts and keeps
  // a green family, matching the approved card — but it shares a row with the commission badge,
  // which is the number a locator is actually scanning for. Wearing that badge's exact palette
  // made two equally loud chips compete for the same glance.
  //
  // So this is the same hue, desaturated and dimmed: saturation drops from roughly 66% to 16%,
  // and contrast against its own fill from about 8.7:1 to 6.8:1 — still comfortably past the
  // 4.5:1 readable threshold, just no longer shouting. The commission badge is untouched and
  // remains the strongest green on the card.
  //
  // Hookups stays neutral, the weaker fact, which is the same distinction the client-facing
  // pill already draws (.lbr-wd--inc green, .lbr-wd--hk grey).
  const tone =
    status === "included"
      ? "border-[#2a3a33] bg-[#16211c] text-[#8fae9f]"
      : "border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)]"
  return (
    <span
      className={`inline-flex max-w-full flex-none items-center whitespace-nowrap rounded-md border px-1.5 py-[2px] text-[10.5px] font-semibold leading-none ${tone} ${className}`}
      title={`${WASHER_DRYER_LABEL[status]} — verified on the property or confirmed for this client`}
    >
      {WASHER_DRYER_LABEL[status]}
    </span>
  )
}
