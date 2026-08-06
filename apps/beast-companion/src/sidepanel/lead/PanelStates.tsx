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
  | "no-client"
  | "not-connected"
  | "unauthorized"
  | "not-found"
  | "error"
  | "offline";

export const NON_LOADED_STATES: Exclude<PanelState, "loaded">[] = [
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

export function PanelStateView({ state }: { state: Exclude<PanelState, "loaded"> }) {
  switch (state) {
    case "loading":
      return <LoadingSkeleton />;
    case "no-client":
      return (
        <Centered
          icon="🗂️"
          title="No client selected"
          body="Open a client from your Locator Beast Kanban to see their profile and next actions here."
        />
      );
    case "not-connected":
      return (
        <Centered
          icon="🔌"
          title="Connect Locator Beast"
          body="Companion isn’t connected to your Locator Beast account yet. Connect to load your clients."
          action={{ label: "Connect Locator Beast" }}
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
