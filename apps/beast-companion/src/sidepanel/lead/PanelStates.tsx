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
  body: string;
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
  onConnect,
}: {
  state: Exclude<PanelState, "loaded">;
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
      // Pre-authenticated state — the user must connect first.
      return (
        <Centered
          icon="🔌"
          title="Not connected"
          body="Connect your Locator Beast account to view your clients here."
          action={{ label: "Connect to Locator Beast", onClick: onConnect }}
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
