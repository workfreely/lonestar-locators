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
  // INCLUDED IS THE STRONGER CLAIM and takes the green treatment, matching the approved card.
  // Hookups is the weaker fact, so it reads neutral — the same distinction the client-facing
  // pill already draws (.lbr-wd--inc green, .lbr-wd--hk grey). The two surfaces should not
  // disagree about which of the two is the bigger promise.
  const tone =
    status === "included"
      ? "border-[#1e5235] bg-[#0f2a1d] text-[#4ade80]"
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
