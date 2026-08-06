# Beast Companion — Auth Threat Model & Flow (design, pre-implementation)

Required design gate **before** any authentication is implemented (auth is a later
phase, not Phase 2). Establishes the pairing/renewal model, the trust boundaries,
and the threats it must resist. No auth code exists yet.

## 1. Trust boundaries & actors
- **Locator Beast web app** (`locatorbeast.com`) — first-party, cookie session (Supabase). Source of truth.
- **LB content script** — injected by the extension on `locatorbeast.com/admin/*`. Runs in the page's origin, **can** read the LB session cookie context indirectly (same-origin fetches with credentials), but is still *extension-controlled code*.
- **SAD / Google / property content scripts** — run on third-party origins. **No LB cookies available here.** Untrusted page DOM.
- **Extension background service worker** — extension origin; no cookies for LB.
- **Side panel** (`chrome-extension://…`) — extension origin; renders the lead UI; must call LB APIs cross-origin.
- **Locator Beast API** — verifies every request server-side (workspace membership, billing entitlement, ownership).

Key asymmetry driving the design: **the side panel and non-LB content scripts cannot rely on LB cookies**, so the panel needs a bearer credential that works from the extension origin on any tab.

## 2. Credential model (approved: short-lived, workspace-scoped)
No permanent bearer/device token. Instead:

- **Access token** — short-lived (e.g. ~10 min) JWT, scoped to `{ userId, workspaceId, extensionClientId, capabilities[] }`. Sent as `Authorization: Bearer` to Companion APIs. Never persisted beyond memory / `chrome.storage.session`.
- **Refresh credential** — rotating, revocable, opaque. Used only to mint new access tokens. **Server stores only a hash** of it (argon2/bcrypt/SHA-256+pepper). Rotated on every use (reuse of an old refresh value ⇒ revoke the whole chain = refresh-token-reuse detection).
- **Capabilities** — the token is scoped to permitted API capabilities (e.g. `leads:read`, `leads:write`, `actions:write`) so a compromised token can't exceed its grant.

## 3. Pairing flow (explicit user approval + single-use exchange)
```
1. User clicks "Connect" in the Companion panel.
2. Panel opens an AUTHENTICATED LB page:  https://locatorbeast.com/extension/connect
   (opened in a normal tab so the LB cookie session authenticates the user).
3. LB /extension/connect shows what the extension will be allowed to do
   (workspace, capabilities) and the extension's identity (client id + validated
   extension ID/origin). The USER EXPLICITLY APPROVES.
4. Server issues a SINGLE-USE, short-TTL exchange code (bound to the extension
   client id + a PKCE-style code_challenge the extension supplied).
5. The extension exchanges the code (+ code_verifier) at POST /api/companion/token
   → receives { accessToken (short-lived), refreshCredential (rotating) }.
   Server stores only hash(refreshCredential), scoped to user+workspace+client+caps.
6. Renewal: POST /api/companion/token/refresh with the current refresh credential
   → new access token + newly rotated refresh credential (old hash invalidated).
7. Revocation: user revokes access/refresh from Locator Beast Settings → all
   tokens for that extension client die; next refresh fails closed.
```
- **Extension identity validation:** the exchange/refresh endpoints validate the caller is the **production extension ID/origin**. A **separate, clearly-flagged dev allowlist** (never merged into the production check, gated by an env flag) permits the unpacked dev extension id.
- **PKCE** on the exchange prevents a stolen code from being redeemed by another party.

## 4. What is NEVER stored in the extension
Lead profiles, notes, credit information, or any client PII. Only: the short-lived access token, the rotating refresh credential, and the **active lead id** (not the record). All lead data is fetched live from the API and held in memory only.

## 5. Same-window bridge threats (see bridge/messages.ts)
- Bridge messages carry **only** `{ ns, ts, type, leadId, event? }` — `.strict()` schemas reject any message with extra keys (no PII smuggling).
- Consumers validate: **origin/hostname** (production allowlist; dev separate), **namespace**, **schema**, and **lead ownership** (server-side on the API refetch). A message is a *signal*, never data — the receiver always refetches authorized data through the API.
- The page cannot forge authority: even a valid-looking `active-client` event only causes a refetch, which the server authorizes against the session/token workspace. A leadId the caller doesn't own returns 403.

## 6. Threats & mitigations
| Threat | Mitigation |
|---|---|
| Stolen access token | Short TTL; capability-scoped; revocable; workspace-bound |
| Stolen refresh credential | Only a hash stored server-side; rotation + reuse-detection revokes the chain; user-revocable |
| Malicious page forging bridge events | Origin + namespace + `.strict()` schema + server-side ownership on refetch; events are signals only |
| PII exfiltration via DOM events | `.strict()` schemas carry only id/type/ts; no records ever put on the bus |
| Other extension impersonating ours | Exchange/refresh validate production extension ID/origin; PKCE binds the code |
| Cross-workspace access | Token scoped to one `workspaceId`; every API re-checks membership + ownership |
| Token replay from a non-LB tab | Bearer works from the extension origin, but every request is authorized server-side; no ambient cookie authority is trusted |
| Billing/entitlement bypass | `requireWorkspaceMember`-equivalent + `lb_workspace_has_access` re-checked per request; fails closed |
| Lost/again-needed session on SAD/Google tabs | Panel uses the bearer token (not cookies); refresh happens whenever an LB tab is present |

## 7. Server-side validation (every Companion API request)
1. Verify access-token signature + expiry.
2. Resolve `{ userId, workspaceId, capabilities }` from the token (never from the request body).
3. Re-check active workspace membership + billing entitlement.
4. Enforce the capability required for the route.
5. Enforce **ownership**: the target `leadId`/`actionId` belongs to `workspaceId`.
6. Scope every read/write to `workspaceId`. Fail closed on any check.

## 8. Out of scope for now (later phases)
- The actual token endpoints, `/extension/connect` UI, Settings revocation UI, and CORS/host-permission wiring are implemented in the auth phase (order step 4), each behind its own review. This document is the design they must satisfy.
