# Locator Beast Companion — V1 End-to-End Test Checklist

Validate every V1 workflow on your own Mac + account **before** signing,
notarization, or distribution. Check each box only when the **Expected** result
is observed.

## Prerequisites

- [ ] Migrations `20260729000002`, `20260729000003`, `20260729000004` applied to
      the Locator Beast Supabase project.
- [ ] Backend running and reachable (local `npm run dev` on :3000, or a preview).
- [ ] Companion running unsigned: `cd companion && LB_BASE_URL=http://localhost:3000 swift run`.
- [ ] A test lead exists whose phone matches a real Messages thread on this Mac.
- [ ] Menu-bar icon (💬) visible.

**How to trigger admin states**
- Pause / Resume / Revoke / Reset Pairing → **Connected Devices** page buttons.
- Trial/subscription states → set `profiles.subscription_status` / `trial_ends_at`
  (Supabase SQL).
- Maintenance → set `COMPANION_MAINTENANCE=true` in the backend env, restart.
- Version enforcement → temporarily raise `MIN_COMPANION_VERSION` above `1.0.0`.

---

## Onboarding & pairing

- [ ] **Full Disk Access onboarding** — with FDA off, menu shows *Needs Full Disk
      Access*; "Grant Full Disk Access…" opens the correct pane; after granting +
      relaunch, status advances.
- [ ] **Pairing flow** — "Connect Locator Beast…" opens the browser to the pair
      page; Approve hands off to the loopback; menu shows *Connected*; a token is
      in Keychain; a row appears under Connected Devices.

## Sync

- [ ] **Background sync** — new iMessages appear as `companion_messages` within
      one sync interval (~30s) without any manual action.
- [ ] **Manual Refresh** — "Refresh Now" ingests immediately.
- [ ] **Last Sync updates** — menu + Connected Devices "Last Sync" reflect the
      most recent successful ingest.
- [ ] **Duplicate message prevention** — trigger a re-sync of already-sent
      messages (e.g. Refresh repeatedly); no duplicate `companion_messages` rows
      for the same `guid`.
- [ ] **Offline recovery** — disable network; sync shows *Offline — will retry*;
      re-enable; the next tick ingests the backlog with no loss and no dupes.

## AI Assistant

- [ ] **AI summaries** — after messages ingest, the lead's AI brief
      (`ai_client_briefs`) populates from the ingested transcript.
- [ ] **AI Next Actions** — the AI Next Action surfaces for that lead in the CRM.

## Device controls (Connected Devices)

- [ ] **Connected Devices updates** — row shows device name, *Messages Sync*
      status, Last Sync, Version, and date connected, and refreshes as the device
      checks in.
- [ ] **Pause** — click Pause; on the next heartbeat/upload the Companion shows
      *Paused* and stops uploading (server 403).
- [ ] **Resume** — click Resume; the Companion auto-resumes syncing without any
      local action.
- [ ] **Revoke** — click Revoke; Companion shows *Disconnected* and stops; the
      row shows *Revoked*; re-pairing is required.
- [ ] **Reset Pairing** — click Reset Pairing; Companion shows *"Pairing has been
      reset. Please reconnect this Mac to Locator Beast."*, clears its Keychain
      token, stops syncing; the device row is preserved (status *Reset — reconnect
      required*, history intact). Re-pairing reuses the same row with a new token
      and history (name/created/last-sync) is kept.

## Entitlement (server-authoritative)

- [ ] **Trial expiration** — set `trial_ends_at` in the past; within a heartbeat
      the Companion shows *Paused* with the billing message and stops uploading.
- [ ] **Subscription expiration** — set `subscription_status` to `canceled` /
      `past_due`; Companion pauses and refuses uploads.
- [ ] **Automatic resume after reactivation** — restore an active trial/
      subscription; on the next heartbeat the Companion resumes syncing with no
      re-pair or reinstall.

## Fleet controls (no new build)

- [ ] **Version enforcement** — raise `MIN_COMPANION_VERSION`; Companion shows
      *Update required* and the server returns 426 on upload.
- [ ] **Maintenance mode** — set `COMPANION_MAINTENANCE=true`; Companion shows
      *Temporarily unavailable* and uploads are rejected (503); unset → resumes.

---

## Sign-off

- [ ] All boxes above pass on a real Mac + real account.
- [ ] No secrets in the app bundle; only the Keychain device token persists.
- [ ] Release build (`scripts/build-release.sh`) produces a stripped binary.

Only after this checklist passes do we proceed to signing → notarization →
Sparkle → distribution.
