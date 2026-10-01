/**
 * BEAST SYNC STATUS — the six states, and the rules that keep them honest.
 *
 * The assertions that matter most are the negative ones:
 *   • a device that has not reported Full Disk Access must NEVER show the FDA
 *     warning (unknown is not failure);
 *   • "Connected" requires an actual sync, not merely a reachable Mac;
 *   • one asleep laptop must not make a working desktop look broken;
 *   • no label anywhere may leak token / pairing-record vocabulary.
 *
 * Run: npx tsx scripts/tests/beastSyncStatus.test.ts
 */
import {
  deriveBeastSyncStatus,
  statusForDevice,
  lastSyncText,
  REACHABLE_WINDOW_MS,
  CONNECTING_GRACE_MS,
  type BeastSyncState,
  type DeviceRow,
} from "../../lib/companion/syncStatus"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

const NOW = Date.parse("2026-10-01T18:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60_000

/** A healthy, recently-synced Mac. Each test overrides only what it is about. */
function device(over: Partial<DeviceRow> = {}): DeviceRow {
  return {
    id: "d1",
    device_name: "Jay's MacBook Pro",
    created_at: ago(30 * 24 * 60 * MIN),
    last_used_at: ago(1 * MIN),
    last_synced_at: ago(2 * MIN),
    sync_paused: false,
    pairing_reset_at: null,
    revoked_at: null,
    fda_granted: true,
    sync_phase: "idle",
    ...over,
  }
}

const state = (over: Partial<DeviceRow> = {}): BeastSyncState => statusForDevice(device(over), NOW).state

console.log("\nBEAST SYNC STATUS\n")

console.log("The six states")
check("no devices at all → Not Connected", deriveBeastSyncStatus([], NOW).state === "not_connected")
check("healthy + recently synced → Connected", state() === "connected")
check("freshly paired, no sync yet → Connecting", state({ created_at: ago(10_000), last_synced_at: null }) === "connecting")
check("device reports FDA missing → Needs Full Disk Access", state({ fda_granted: false }) === "needs_full_disk_access")
check("paused → Sync Paused", state({ sync_paused: true }) === "sync_paused")
check(
  "reachable long ago → Connection Error",
  state({ last_used_at: ago(REACHABLE_WINDOW_MS + MIN) }) === "connection_error",
)

console.log("\nUnknown is never failure")
check("fda_granted null (not reported) → still Connected", state({ fda_granted: null }) === "connected")
check("fda_granted undefined (column not migrated) → still Connected", state({ fda_granted: undefined }) === "connected")
check("sync_phase null → still Connected", state({ sync_phase: null }) === "connected")
check(
  "a row with ONLY the pre-migration columns derives a real state",
  statusForDevice(
    { id: "d1", created_at: ago(5 * MIN), last_used_at: ago(MIN), last_synced_at: ago(MIN) },
    NOW,
  ).state === "connected",
)
check(
  "FDA warning is shown ONLY on an explicit false",
  [null, undefined, true].every((v) => statusForDevice(device({ fda_granted: v }), NOW).state !== "needs_full_disk_access"),
)

console.log("\nConnected means synced, not merely reachable")
check(
  "reachable but never synced, past the grace window → Connection Error, not Connected",
  state({ created_at: ago(CONNECTING_GRACE_MS + MIN), last_synced_at: null }) === "connection_error",
)
check(
  "reachable, never synced, inside the grace window → Connecting",
  state({ created_at: ago(CONNECTING_GRACE_MS - MIN), last_synced_at: null }) === "connecting",
)
check(
  "actively syncing its first batch stays Connecting past the window",
  state({ created_at: ago(10 * CONNECTING_GRACE_MS), last_synced_at: null, sync_phase: "syncing" }) === "connecting",
)
check("no last_used_at at all → Connection Error", state({ last_used_at: null }) === "connection_error")

console.log("\nBlocking order (several can be true at once)")
check(
  "revoked AND missing FDA → Not Connected (do not send them to System Settings)",
  statusForDevice(device({ revoked_at: ago(MIN), fda_granted: false }), NOW).state === "not_connected",
)
check(
  "paused AND missing FDA → Sync Paused (the deliberate choice wins)",
  state({ sync_paused: true, fda_granted: false }) === "sync_paused",
)
check(
  "pairing reset → Not Connected and offers Reconnect",
  (() => {
    const s = statusForDevice(device({ pairing_reset_at: ago(MIN) }), NOW)
    return s.state === "not_connected" && s.canReconnect
  })(),
)
check(
  "Open System Settings is offered for exactly one state",
  (
    [
      device(),
      device({ sync_paused: true }),
      device({ last_used_at: ago(2 * REACHABLE_WINDOW_MS) }),
      device({ pairing_reset_at: ago(MIN) }),
      device({ created_at: ago(10_000), last_synced_at: null }),
    ] as DeviceRow[]
  ).every((d) => !statusForDevice(d, NOW).needsPermission) &&
    statusForDevice(device({ fda_granted: false }), NOW).needsPermission,
)
check(
  "a quiet-but-healthy Mac never offers Reconnect",
  !statusForDevice(device({ last_synced_at: ago(6 * 60 * MIN) }), NOW).canReconnect,
)

console.log("\nWorkspace rollup — the healthiest device represents it")
check(
  "one asleep laptop does not break a working desktop",
  deriveBeastSyncStatus([device({ id: "asleep", last_used_at: ago(3 * REACHABLE_WINDOW_MS) }), device({ id: "desk" })], NOW)
    .state === "connected",
)
check(
  "all revoked → Not Connected",
  deriveBeastSyncStatus([device({ id: "a", revoked_at: ago(MIN) }), device({ id: "b", revoked_at: ago(MIN) })], NOW)
    .state === "not_connected",
)
check(
  "a revoked row never outranks the live one it sits beside",
  deriveBeastSyncStatus([device({ id: "gone", revoked_at: ago(MIN) }), device({ id: "live", sync_paused: true })], NOW)
    .state === "sync_paused",
)
check(
  "FDA on one Mac surfaces when the other is merely paused",
  deriveBeastSyncStatus([device({ id: "a", sync_paused: true }), device({ id: "b", fda_granted: false })], NOW).state ===
    "needs_full_disk_access",
)

console.log("\nCopy the user approved")
check(
  'FDA copy is exactly "Beast Sync needs Full Disk Access to sync Messages."',
  statusForDevice(device({ fda_granted: false }), NOW).detail ===
    "Beast Sync needs Full Disk Access to sync Messages.",
)
check('connected label is "Beast Sync Connected"', statusForDevice(device(), NOW).label === "Beast Sync Connected")
check('empty label is "Not Connected"', deriveBeastSyncStatus([], NOW).label === "Not Connected")

console.log("\nNo internal vocabulary leaks to the agent")
const FORBIDDEN = ["token", "device_token", "prefix", "revoke", "revoked", "bearer", "api key", "lead id", "uuid"]
const everyLabel = (
  [
    device(),
    device({ fda_granted: false }),
    device({ sync_paused: true }),
    device({ revoked_at: ago(MIN) }),
    device({ pairing_reset_at: ago(MIN) }),
    device({ created_at: ago(10_000), last_synced_at: null }),
    device({ created_at: ago(10 * CONNECTING_GRACE_MS), last_synced_at: null }),
    device({ last_used_at: ago(2 * REACHABLE_WINDOW_MS) }),
    device({ sync_phase: "needs_update" }),
  ] as DeviceRow[]
).flatMap((d) => {
  const s = statusForDevice(d, NOW)
  return [s.label, s.detail ?? ""]
})
check(
  `${everyLabel.length} user-facing strings carry no token/revocation vocabulary`,
  everyLabel.every((t) => !FORBIDDEN.some((w) => t.toLowerCase().includes(w))),
  everyLabel.find((t) => FORBIDDEN.some((w) => t.toLowerCase().includes(w))),
)
check("every state produces a non-empty label", everyLabel.filter((_, i) => i % 2 === 0).every((l) => l.length > 0))

console.log("\nLast-sync phrasing")
check('2 minutes → "2 min ago"', lastSyncText(ago(2 * MIN), NOW) === "2 min ago")
check('30 seconds → "just now"', lastSyncText(ago(30_000), NOW) === "just now")
check('1 minute is singular', lastSyncText(ago(MIN), NOW) === "1 min ago")
check('59 minutes stays in minutes', lastSyncText(ago(59 * MIN), NOW) === "59 min ago")
check('90 minutes → "1 hour ago"', lastSyncText(ago(90 * MIN), NOW) === "1 hour ago")
check('26 hours → "1 day ago"', lastSyncText(ago(26 * 60 * MIN), NOW) === "1 day ago")
check('null → "never"', lastSyncText(null, NOW) === "never")
check("clock skew (future timestamp) does not print a negative", lastSyncText(new Date(NOW + 5 * MIN).toISOString(), NOW) === "just now")
// The guard that actually earns its place: an unparseable value yields NaN, which
// slips through every `<` comparison below it and would render "NaN days ago".
check('an unparseable timestamp → "never", not "NaN days ago"', lastSyncText("not-a-date", NOW) === "never")
check('an empty string → "never"', lastSyncText("", NOW) === "never")

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
