/**
 * BEAST SYNC STATUS — the ONE place a device row becomes a user-facing state.
 *
 * Pure and framework-agnostic so every surface derives the same answer: the Beast
 * Sync card in the CRM and the Connected Devices list in Integrations both call
 * this. Two independent derivations were how the old list ended up with its own
 * five labels ("Idle", "Revoked", …) that no other surface used.
 *
 * NO DEVICE-TOKEN VOCABULARY LEAVES HERE. An agent sees Beast Sync states; tokens,
 * prefixes and revocation are implementation details of how the Mac authenticates.
 *
 * Ordering matters: the checks run most-blocking first, because several can be true
 * at once. A revoked device that also reports needing Full Disk Access is Not
 * Connected — telling someone to grant a permission to a device that can no longer
 * authenticate would send them down the wrong path entirely.
 */

export type BeastSyncState =
  | "not_connected"
  | "connecting"
  | "connected"
  | "needs_full_disk_access"
  | "sync_paused"
  | "connection_error"

export type DeviceRow = {
  id: string
  device_name?: string | null
  app_version?: string | null
  created_at?: string | null
  last_used_at?: string | null
  last_synced_at?: string | null
  sync_paused?: boolean | null
  pairing_reset_at?: string | null
  revoked_at?: string | null
  /** Device self-report (migration 20261011). null = not reported yet, NEVER "no". */
  fda_granted?: boolean | null
  sync_phase?: string | null
}

/**
 * A device that has authenticated within this window is considered reachable.
 * Generous relative to the Companion's own cadence (30s sync, 5-minute entitlement
 * re-check) so a laptop that slept briefly, or a slow network, is not reported as
 * an error. Erring long means "Connection Error" implies something real.
 */
export const REACHABLE_WINDOW_MS = 15 * 60 * 1000

/**
 * A freshly paired device that has authenticated but not yet completed a sync is
 * still "Connecting" for this long. Beyond it, something is wrong rather than slow.
 */
export const CONNECTING_GRACE_MS = 2 * 60 * 1000

export type BeastSyncStatus = {
  state: BeastSyncState
  /** The chip text. */
  label: string
  /** One sentence under it, or null when the label says everything. */
  detail: string | null
  tone: "ok" | "warn" | "bad" | "muted"
  /** Only true for needs_full_disk_access — drives the Open System Settings action. */
  needsPermission: boolean
  /** Whether Reconnect should be offered (never offered merely because sync is quiet). */
  canReconnect: boolean
  lastSyncedAt: string | null
}

const NOT_CONNECTED: BeastSyncStatus = {
  state: "not_connected",
  label: "Not Connected",
  detail: "Connect Beast Sync on your Mac to sync Messages.",
  tone: "muted",
  needsPermission: false,
  canReconnect: false,
  lastSyncedAt: null,
}

/**
 * Derive the state for a workspace from its device rows.
 *
 * Takes the LIST, not one row, because a workspace can have several Macs and the
 * agent cares about one question — "is Beast Sync working for me?" The healthiest
 * device answers it: one paired laptop that is asleep must not make a working
 * desktop look broken.
 */
export function deriveBeastSyncStatus(devices: DeviceRow[], now: number = Date.now()): BeastSyncStatus {
  const live = devices.filter((d) => !d.revoked_at)
  if (live.length === 0) return NOT_CONNECTED

  const ranked = live.map((d) => statusForDevice(d, now)).sort((a, b) => RANK[a.state] - RANK[b.state])
  return ranked[0]
}

/**
 * Best (least blocking) first, so the healthiest device represents the workspace.
 *
 * Exhaustive by construction: `Record<BeastSyncState, number>` without a cast, so
 * adding a seventh state is a compile error here rather than an `undefined` that
 * sorts unpredictably.
 */
const RANK: Record<BeastSyncState, number> = {
  connected: 0,
  connecting: 1,
  needs_full_disk_access: 2,
  sync_paused: 3,
  connection_error: 4,
  not_connected: 5,
}

export function statusForDevice(d: DeviceRow, now: number = Date.now()): BeastSyncStatus {
  const lastSyncedAt = d.last_synced_at ?? null

  // 1. Cannot authenticate at all → nothing else is actionable.
  if (d.revoked_at) return { ...NOT_CONNECTED, lastSyncedAt }
  if (d.pairing_reset_at) {
    return {
      state: "not_connected",
      label: "Not Connected",
      detail: "Beast Sync needs to be reconnected on your Mac.",
      tone: "muted",
      needsPermission: false,
      canReconnect: true,
      lastSyncedAt,
    }
  }

  // 2. Paused is an explicit administrative decision — report it before anything
  //    the device self-reports, which it keeps sending while paused.
  if (d.sync_paused) {
    return {
      state: "sync_paused",
      label: "Sync Paused",
      detail: "Messages sync is paused for this Mac.",
      tone: "warn",
      needsPermission: false,
      canReconnect: false,
      lastSyncedAt,
    }
  }

  // 3. Full Disk Access — the one state only the Mac can tell us about. Trusted
  //    ONLY as an explicit true/false; null means "not reported yet", so an older
  //    build that never reports simply never shows this state.
  if (d.fda_granted === false || d.sync_phase === "needs_full_disk_access") {
    return {
      state: "needs_full_disk_access",
      label: "Needs Full Disk Access",
      detail: "Beast Sync needs Full Disk Access to sync Messages.",
      tone: "warn",
      needsPermission: true,
      canReconnect: false,
      lastSyncedAt,
    }
  }

  // 4. Phases that are genuinely broken rather than quiet.
  if (d.sync_phase === "needs_update") {
    return {
      state: "connection_error",
      label: "Connection Error",
      detail: "Beast Sync needs to be updated on your Mac.",
      tone: "bad",
      needsPermission: false,
      canReconnect: false,
      lastSyncedAt,
    }
  }

  // 5. Reachability, from the last successful authenticated call.
  const seenMs = d.last_used_at ? now - new Date(d.last_used_at).getTime() : Infinity
  const reachable = seenMs < REACHABLE_WINDOW_MS

  if (!reachable) {
    return {
      state: "connection_error",
      label: "Connection Error",
      detail: "Beast Sync hasn't checked in recently. Make sure it's running on your Mac.",
      tone: "bad",
      needsPermission: false,
      canReconnect: true,
      lastSyncedAt,
    }
  }

  // 6. Reachable, but has it actually synced yet? A device that just paired is
  //    Connecting, not broken — and not yet Connected either, because nothing has
  //    come through. Past the grace window with still no sync, it is an error.
  if (!lastSyncedAt) {
    const pairedMs = d.created_at ? now - new Date(d.created_at).getTime() : 0
    if (pairedMs < CONNECTING_GRACE_MS || d.sync_phase === "syncing") {
      return {
        state: "connecting",
        label: "Connecting",
        detail: "Beast Sync is starting its first sync.",
        tone: "warn",
        needsPermission: false,
        canReconnect: false,
        lastSyncedAt: null,
      }
    }
    return {
      state: "connection_error",
      label: "Connection Error",
      detail: "Beast Sync connected but hasn't synced any Messages yet.",
      tone: "bad",
      needsPermission: false,
      canReconnect: true,
      lastSyncedAt: null,
    }
  }

  return {
    state: "connected",
    label: "Beast Sync Connected",
    detail: null,
    tone: "ok",
    needsPermission: false,
    canReconnect: false,
    lastSyncedAt,
  }
}

/** "2 min ago" — the relative phrasing the Beast Sync card shows. */
export function lastSyncText(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never"
  const t = new Date(iso).getTime()
  // An unparseable timestamp is "never", not "just now": NaN slips through every
  // comparison below and would otherwise render as "NaN days ago", and claiming a
  // sync just happened on the strength of a value we could not read is worse than
  // admitting we have none.
  if (!Number.isFinite(t)) return "never"
  const ms = now - t
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return "just now"
  if (mins === 1) return "1 min ago"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs === 1) return "1 hour ago"
  if (hrs < 24) return `${hrs} hours ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? "1 day ago" : `${days} days ago`
}

/** The System Settings pane that grants Full Disk Access. */
export const FULL_DISK_ACCESS_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AllFiles"
