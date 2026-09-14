// Shared presentation for the PUBLIC destination-authorization pages (recipient-facing). Pure,
// self-contained styling (no CRM chrome, no account concepts) so a family member sees only a
// simple "connect your Instagram" experience. Reveals nothing about the owner or Beast Social.

type State =
  | "valid"
  | "connected"
  | "used"
  | "revoked"
  | "expired"
  | "invalid"
  | "denied"
  | "state"
  | "exchange"
  | "store"
  | "no_account"
  | "account_taken"
  | "not_configured"

const COPY: Record<State, { title: string; body: string }> = {
  valid: {
    title: "Connect your Instagram",
    body: "You've been invited to connect your Instagram account. You'll be sent to Instagram to authorize access. Nothing else is shared, and you won't create any account here.",
  },
  connected: {
    title: "You’re all set!",
    body: "Your Instagram account was connected to Beast Social successfully.\n\nAutomated posts can now be scheduled to this account.\n\nYou can close this window.",
  },
  used: {
    title: "This link was already used",
    body: "This invitation has already been completed. If you need to connect again, ask for a fresh link.",
  },
  revoked: {
    title: "This link is no longer active",
    body: "This invitation was cancelled. Please ask for a new link if you still need to connect.",
  },
  expired: {
    title: "This link has expired",
    body: "For security, invitation links are only valid for a short time. Please ask for a new link.",
  },
  invalid: {
    title: "This link isn't valid",
    body: "We couldn't recognize this invitation link. Please double-check the link you were sent.",
  },
  denied: {
    title: "Authorization cancelled",
    body: "It looks like the Instagram authorization was cancelled. You can try again using your link.",
  },
  state: {
    title: "Something interrupted the sign-in",
    body: "We couldn't safely verify the request. Please open your invitation link again and retry.",
  },
  exchange: {
    title: "Instagram sign-in didn't finish",
    body: "Instagram couldn't complete the connection. Please try again in a moment using your link.",
  },
  store: {
    title: "Almost there — please retry",
    body: "We connected to Instagram but couldn't finish saving. Please open your link and try once more.",
  },
  no_account: {
    title: "No Instagram account found",
    body: "We couldn't read an Instagram account from that authorization. Make sure you're signed in to the right Instagram account and try again.",
  },
  account_taken: {
    title: "This Instagram is already connected",
    body: "This Instagram account is already set up elsewhere. If that's unexpected, let the person who sent you the link know.",
  },
  not_configured: {
    title: "Not available yet",
    body: "Instagram connection isn't available right now. Please try again later.",
  },
}

export default function AuthorizeShell({
  state,
  label,
  beginHref,
}: {
  state: string
  label?: string | null
  beginHref?: string
}) {
  const key = (state in COPY ? state : "invalid") as State
  const copy = COPY[key]
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#0b0b0f",
        color: "#f5f5f7",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#16161c",
          border: "1px solid #26262e",
          borderRadius: 20,
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#9aa0aa",
            marginBottom: 14,
          }}
        >
          Instagram Authorization
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 10px", lineHeight: 1.2 }}>{copy.title}</h1>
        {label && state === "valid" && (
          <div style={{ fontSize: 14, color: "#c7ccd4", margin: "0 0 12px" }}>
            Invitation: <strong style={{ color: "#f5f5f7" }}>{label}</strong>
          </div>
        )}
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "#b7bcc6", margin: "0 0 22px", whiteSpace: "pre-line" }}>{copy.body}</p>

        {state === "valid" && beginHref && (
          <a
            href={beginHref}
            style={{
              display: "inline-block",
              background: "linear-gradient(90deg,#f58529,#dd2a7b,#8134af)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              padding: "12px 22px",
              borderRadius: 12,
            }}
          >
            Authorize on Instagram
          </a>
        )}

        {/* Tiny helper footer — hidden on the success screen (copy request); unchanged elsewhere. */}
        {state !== "connected" && (
          <div style={{ marginTop: 22, fontSize: 11.5, color: "#6c7079", lineHeight: 1.5 }}>
            This link only authorizes your Instagram for scheduled posting. It does not create an
            account or give access to anything else.
          </div>
        )}
      </div>
    </div>
  )
}
