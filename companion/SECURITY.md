# Locator Beast Companion — Security Boundary & Threat Model

The Companion is a **thin client**. It reads Apple Messages, normalizes and
batches them, authenticates with a revocable token, uploads, and displays
server-authoritative status. All proprietary logic stays on the backend.

## What lives IN the Companion (assume inspectable)

- Apple Messages reading: a read-only `chat.db` SQLite query, basic
  `attributedBody` text extraction, tapback filtering, Apple-epoch conversion.
- Minimal normalization + batching (guid, phone, direction, timestamp, text).
- Auth plumbing: attach the Keychain device token as a Bearer header.
- HTTPS upload + a status heartbeat; reflect the server's verdict in the menu.
- Public config: the base URL and endpoint paths.

Nothing here is a trade secret — it's the mechanics of reading a local DB and
POSTing JSON.

## What stays SERVER-SIDE (never shipped)

- AI prompts, models, and analysis; the `ai_client_briefs` generation.
- Lead attribution rules (phone → lead matching happens at ingest).
- Entitlement decisions (trial/subscription/`messages_sync`), maintenance and
  version policy, per-device pause.
- All database operations, service-role credentials, and workflow logic.

The Companion cannot compute any of this; it only submits raw messages and asks
"am I allowed?".

## What an attacker inspecting the app could learn

- The base URL and the three endpoint paths (`/pair`, `/messages`, `/status`).
- The request/response shapes (already low-value: a message batch, a status
  object).
- The `chat.db` reading technique (a well-known, non-proprietary approach).

They could **not** obtain: server credentials, AI keys, Supabase service-role
keys, another user's data, or the ability to bypass entitlement — because none
of those exist in the client and every decision is enforced server-side.

## No embedded secrets

The **only** persistent credential is the per-device token in the macOS
**Keychain** (`kSecAttrAccessibleAfterFirstUnlock`). We store it hashed
(sha256) server-side — the raw value is shown once at pairing. There are **no**
Supabase keys, AI keys, signing secrets, or shared API credentials in the app.

## Token protection & revocation

- Issued via loopback-OAuth (browser session authorizes the mint); returned once
  to `127.0.0.1`, stored in the Keychain.
- Server stores only `sha256(token)`; a leaked DB doesn't yield usable tokens.
- **Revoke Device** sets `revoked_at`; the server token guard 401s that device
  on its next heartbeat/upload, and the Companion shows **Disconnected** and
  stops. Tokens can also be **paused** (`sync_paused`) without revoking.

## Replay, duplicates, abuse, unsupported versions

- **Duplicates / replay:** every message carries a stable `message.guid`; ingest
  upserts on `(workspace_id, guid)`, so re-delivery or replay is idempotent and
  can't create duplicates or forge new data.
- **Abuse / flooding:** per-device rate limiting (120 batches/min), a max batch
  size (500), and bounded field lengths.
- **Identity spoofing:** the client never sends a trusted `workspace_id`/
  `user_id`; the server resolves identity from the token hash only.
- **Unsupported versions:** the reported version (User-Agent) is gated against
  `MIN_COMPANION_VERSION`; too-old clients get `426` and are told to update — a
  kill-switch for `chat.db` schema breaks, with no new build needed to enforce.
- **Remote controls (no redeploy):** `entitled`, `revoked` (401), `syncPaused`,
  `maintenance`, and `minVersion` are all server-driven, so a device can be
  paused, blocked, or required-to-update remotely.

## Production build hardening

`scripts/build-release.sh` builds `-c release` (DEBUG undefined → `info`/`debug`
logs compile out) and strips symbols. The bundle ships only the stripped binary
— no `.swift` sources, test fixtures, debug databases, or dev config. Distribute
Developer-ID-signed + notarized outside the Mac App Store (its sandbox forbids
Full Disk Access).
