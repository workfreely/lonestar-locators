# Locator Beast Companion (macOS)

Native menu-bar agent that reads Apple Messages locally and syncs them into the
Locator Beast AI Assistant. **Phone Sync V1** — focused on a reliable, secure,
end-to-end workflow, not features.

## What it does

1. **Full Disk Access onboarding** — detects whether it can read `chat.db` and
   guides the user to grant FDA (deep-links System Settings; re-checks).
2. **Pairing** — loopback OAuth-style: opens `…/companion/pair` in the browser,
   receives a device token on `127.0.0.1`, stores it in the **Keychain**.
3. **Apple Messages reader** — reads `~/Library/Messages/chat.db` read-only via a
   `MessageSource` (see below), extracting text (incl. `attributedBody` blobs).
4. **Incremental sync** — a global `message.ROWID` high-water mark; only new rows
   are read. `message.guid` is the idempotency key, so retries never dup.
5. **Background sync + Manual Refresh** — periodic sync (poll; FSEvents-on-WAL is
   a later upgrade) plus a menu "Refresh Now".
6. **Status** — menu shows **Messages Sync** state + **Last Sync** time.
7. **Server-authoritative entitlement** — every pair/ingest is gated server-side;
   the app **pauses** when the workspace isn't entitled and **auto-resumes** when
   it is. The app never decides access locally.
8. **Graceful offline/error handling** — a durable on-disk outbox; failed pushes
   retry with backoff; nothing is lost while offline.

## Architecture — pluggable data sources

The reader is isolated behind a protocol so future sources drop in without
refactoring the sync engine:

```
MessageSource (protocol)
 ├── AppleMessagesSource   ← V1 (implemented)
 ├── GmailSource           ← future
 ├── OutlookSource         ← future
 └── CallSummarySource     ← future
```

`SyncEngine` orchestrates any set of `MessageSource`s; V1 registers only
`AppleMessagesSource`.

## Layout

```
Sources/LocatorBeastCompanion/
  App/            AppDelegate, MenuBarController (NSStatusItem)
  Core/           Config, AppLog, FullDiskAccess
  Auth/           Keychain, PairingService (loopback)
  Sources/        MessageSource (protocol+model), AppleMessagesSource (chat.db)
  Sync/           SyncEngine, SyncState (cursor+outbox), BackendClient
```

## Run (local dev, unsigned)

```
cd companion
LB_BASE_URL=http://localhost:3000 swift run
```

Grant Full Disk Access to the built binary / your terminal when prompted.

## Production (later)

Wrap in a signed + notarized `.app` (LSUIElement=YES), register a login item via
`SMAppService`, ship auto-updates via **Sparkle** (EdDSA appcast). Distribute the
`.dmg` outside the Mac App Store (the sandbox forbids Full Disk Access). The
server enforces a **minimum version** (`/api/companion/status` → `minVersion`) as
a kill-switch if Apple changes `chat.db`.

## Backend contract (already built)

- `POST /api/companion/pair` — session-auth → mints a device token once
- `POST /api/companion/messages` — Bearer token → idempotent ingest (`guid`)
- `GET  /api/companion/status` — Bearer token → `{ entitled, reason, minVersion }`
