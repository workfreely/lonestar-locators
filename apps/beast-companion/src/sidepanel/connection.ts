// Companion connection status — the SINGLE source of truth for whether the
// side panel is authenticated. In production this is derived ONLY from the
// service worker's authenticated state (tokens stored + an authenticated
// identity/status request succeeded). There is NO hard-coded or fixture-derived
// "connected" in the production build: the panel starts disconnected and only
// becomes connected after a verified exchange.
//
// Any auth failure (access expired + refresh fails, membership revoked,
// entitlement ended, refresh reuse detected, or an explicit Disconnect) must
// return this to "disconnected" and clear name/workspace.

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export interface CompanionConnection {
  status: ConnectionStatus;
  name?: string | null; // shown only when status === "connected"
  workspace?: string | null; // shown only when status === "connected"
  avatarUrl?: string | null; // locator's profile photo; null → initials fallback
}

export const DISCONNECTED: CompanionConnection = { status: "disconnected" };
