import type { ReactNode } from "react";
import { Button } from "./primitives";

/**
 * Non-loaded panel states. Every required Phase-1/Phase-3 interface state has a
 * distinct, token-styled visual. Action buttons are inert here (demo) — they
 * become real handlers in the auth/live-data phases.
 */

export type PanelState =
  | "loaded"
  | "loading"
  | "connecting"
  | "no-client"
  | "not-connected"
  | "unauthorized"
  | "not-found"
  | "error"
  | "offline";

export const NON_LOADED_STATES: Exclude<PanelState, "loaded">[] = [
  "connecting",
  "loading",
  "no-client",
  "not-connected",
  "unauthorized",
  "not-found",
  "error",
  "offline",
];

function Centered({
  icon,
  title,
  body,
  action,
  tone = "muted",
}: {
  icon: ReactNode;
  title: string;
  // ReactNode (not just string) so a body can bold key words (e.g. the empty-state
  // naming "Lead Board" / "Refresh"). Existing string bodies remain valid.
  body: ReactNode;
  action?: { label: string; onClick?: () => void };
  tone?: "muted" | "danger" | "warning";
}) {
  return (
    <div className={`lp-state tone-${tone}`}>
      <div className="lp-state-icon" aria-hidden>
        {icon}
      </div>
      <h2 className="lp-state-title">{title}</h2>
      <p className="lp-state-body">{body}</p>
      {action && (
        <Button variant="soft" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="lp-skeleton" aria-busy="true" aria-label="Loading client">
      <div className="sk sk-title" />
      <div className="sk sk-line" />
      <div className="sk sk-btns" />
      <div className="sk sk-card" />
      <div className="sk sk-card" />
    </div>
  );
}

export function PanelStateView({
  state,
}: {
  state: Exclude<PanelState, "loaded">;
  /**
   * Still accepted so every caller stays as it was, but no longer used: the one
   * state that offered a connect action no longer does. Kept rather than ripped
   * out because the handler behind it (ProductionPanel → "companion:start-connect")
   * is untouched and would be the hook if a real connect flow ever lands.
   */
  onConnect?: () => void;
}) {
  switch (state) {
    case "loading":
      return <LoadingSkeleton />;
    case "connecting":
      return (
        <Centered
          icon="⏳"
          title="Connecting…"
          body="Finishing sign-in with Locator Beast. This only takes a moment."
        />
      );
    case "no-client":
      // Authenticated-but-no-active-lead. Only reached once connected.
      return (
        <Centered
          icon="🗂️"
          title="No client selected"
          body="Select a lead from your CRM to view their profile here."
        />
      );
    case "not-connected":
      // Companion has nothing to show until a client is picked in the CRM, and
      // selecting one connects it automatically. The old copy ("Not connected" +
      // a "Connect to Locator Beast" button) described a manual connection step
      // that does not exist: the message it sent, "companion:start-connect", has
      // no listener anywhere, so the button did nothing when clicked. Naming the
      // action the agent actually needs to take is the whole fix — the icon and
      // the empty-state styling are unchanged.
      return (
        <Centered
          icon="🔌"
          title="Select a client to start a session"
          body={
            <>
              Select a client in your <strong>Lead Board</strong>, then hit{" "}
              <strong>Refresh</strong> to load their details here.
            </>
          }
        />
      );
    case "unauthorized":
      return (
        <Centered
          icon="🔐"
          title="Session expired"
          body="Your Locator Beast session expired. Sign in again to continue."
          action={{ label: "Sign in again" }}
          tone="warning"
        />
      );
    case "not-found":
      return (
        <Centered
          icon="🔎"
          title="Client not found"
          body="This client may have been archived or is no longer available in your workspace."
        />
      );
    case "error":
      return (
        <Centered
          icon="⚠️"
          title="Something went wrong"
          body="We couldn’t load this client. Please try again."
          action={{ label: "Retry" }}
          tone="danger"
        />
      );
    case "offline":
      return (
        <Centered
          icon="📡"
          title="You’re offline"
          body="Waiting for a connection… we’ll retry automatically."
          action={{ label: "Retry now" }}
          tone="warning"
        />
      );
  }
}
