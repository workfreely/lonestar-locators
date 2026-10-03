import Link from "next/link"

/**
 * The single Out-of-Office card. PRESENTATIONAL ONLY.
 *
 * Deliberately NOT a client component and deliberately not a form: it renders
 * copy and one <Link>. There is no fetch, no state, no submit path — the agent's
 * existing Smart Lead Form at /{username} keeps owning lead intake, so this page
 * adds no write path of any kind.
 *
 * It is a SIBLING of /r/[token]'s PausedResumeCard, never a reuse of it. That one
 * POSTs to /api/r/resume and re-engages a lead; wiring a marketing page into
 * lead-resume logic would be the single worst mistake available here. The two
 * share styling conventions and nothing else.
 */
export default function OutOfOfficeCard({
  username,
  returnDate,
}: {
  username: string
  /** Already formatted for display, or null when the locator gave no return date. */
  returnDate: string | null
}) {
  return (
    <div className="ooo-card">
      {/* A null return date is a real state ("away, no date yet"). Omit the
          sentence entirely rather than printing a placeholder. */}
      {returnDate && <p className="ooo-lead">I’m out of the office until {returnDate}.</p>}
      <p className="ooo-body">Complete the form. I’ll contact you when I return.</p>
      <Link className="ooo-btn" href={`/${username}`}>
        Start My Search
      </Link>
    </div>
  )
}
