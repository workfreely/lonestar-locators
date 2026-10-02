import Foundation

enum SyncPhase: Equatable {
    case needsPairing            // no token
    case disconnected            // token revoked/invalid server-side
    case pairingReset            // credential rotation — token cleared, must re-pair
    case needsFullDiskAccess
    case needsUpdate             // version < server minimum
    case maintenance             // global service pause
    case paused(reason: String)  // entitlement lapsed or per-device pause
    case idle
    case syncing
    case offline
}

extension SyncPhase {
    /// Stable slug reported to the server (device_tokens.sync_phase) and mapped to a
    /// chip by the Beast Sync card. Deliberately NOT derived from the enum's
    /// description: renaming a case must not silently change the wire value, and the
    /// DB has a CHECK constraint on exactly these strings.
    var wireValue: String {
        switch self {
        case .needsPairing:          return "needs_pairing"
        case .disconnected:          return "disconnected"
        case .pairingReset:          return "pairing_reset"
        case .needsFullDiskAccess:   return "needs_full_disk_access"
        case .needsUpdate:           return "needs_update"
        case .maintenance:           return "maintenance"
        case .paused:                return "paused"
        case .idle:                  return "idle"
        case .syncing:               return "syncing"
        case .offline:               return "offline"
        }
    }
}

struct EngineStatus: Equatable {
    var phase: SyncPhase = .needsPairing
    var lastSyncAt: Date?
    var lastError: String?
}

// Orchestrates all MessageSources → backend. Server-authoritative: the engine
// only reads/normalizes/batches/uploads and reflects server verdicts. All
// access decisions (entitlement, revocation, maintenance, version) come from
// the backend heartbeat; nothing is decided locally.
@MainActor
final class SyncEngine {
    private let sources: [MessageSource]
    private var state: SyncState
    private var outbox: OutboxState
    private let backend = BackendClient()
    private let iso = ISO8601DateFormatter()

    private var syncTimer: Timer?
    private var heartbeatTimer: Timer?
    private var outboundTimer: Timer?
    /// Server-delivered phone allowlist. Empty until the first heartbeat — and an
    /// empty list syncs nothing, by design.
    private var identities: [String] = []
    private var isRunning = false
    private var outboundRunning = false

    private(set) var status = EngineStatus()
    var onChange: (() -> Void)?

    init(sources: [MessageSource]) {
        self.sources = sources
        self.state = SyncState.load()
        self.outbox = OutboxState.load()
        self.status.lastSyncAt = state.lastSyncAt
    }

    var isPaired: Bool { Keychain.loadToken() != nil }

    func start() {
        syncTimer = Timer.scheduledTimer(withTimeInterval: Config.syncInterval, repeats: true) { [weak self] _ in
            Task { await self?.runSyncCycle(force: false) }
        }
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: Config.entitlementInterval, repeats: true) { [weak self] _ in
            Task { await self?.heartbeat() }
        }
        outboundTimer = Timer.scheduledTimer(withTimeInterval: Config.outboundPollInterval, repeats: true) { [weak self] _ in
            Task { await self?.runOutboundCycle() }
        }
        Task { await heartbeat(); await runSyncCycle(force: true) }
    }

    func manualRefresh() { Task { await heartbeat(); await runSyncCycle(force: true) } }
    func onPaired() { Task { await runSyncCycle(force: true) } }

    // ── Core cycle ────────────────────────────────────────────────────────
    private func runSyncCycle(force: Bool) async {
        guard isPaired else { setPhase(.needsPairing); return }
        if isRunning && !force { return }
        isRunning = true
        defer { isRunning = false }

        guard FullDiskAccess.isGranted() else { setPhase(.needsFullDiskAccess); return }

        // Don't upload while blocked by a server verdict — confirm via heartbeat.
        if isBlockedPhase {
            await heartbeat()
            if isBlockedPhase { return }
        }

        setPhase(.syncing)
        for source in sources where source.isAvailable() {
            if await syncSource(source) { return } // stop on block/offline
        }
        state.lastSyncAt = Date()
        state.lastSyncError = nil
        state.save()
        status.lastSyncAt = state.lastSyncAt
        setPhase(.idle)
    }

    /// Returns true if the whole cycle should stop.
    ///
    /// TARGETED SYNC. Reads are scoped to the conversations belonging to this
    /// workspace's leads — the allowlist the heartbeat delivers. Nothing else in
    /// chat.db is opened, so personal conversations never leave the Mac.
    ///
    /// Per conversation:
    ///   • no cursor yet  → import the newest `initialImportLimit` messages so the
    ///                      client is usable immediately, then fill history
    ///                      backwards in later cycles
    ///   • cursor present → forward incremental only
    ///   • history floor  → one backward batch per cycle until exhausted
    private func syncSource(_ source: MessageSource) async -> Bool {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return true }

        // An EMPTY allowlist syncs nothing. That is the safe direction: a missing or
        // failed identity fetch can never degrade into "upload everything".
        if identities.isEmpty { return false }

        let conversations: [String: [Int64]]
        do { conversations = try source.resolveConversations(identities: identities) }
        catch { setError("Conversation lookup failed: \(error)"); return true }
        if conversations.isEmpty { return false }

        for (identity, chatIds) in conversations {
            let key = "\(source.sourceId):\(identity)"

            // 1) FORWARD — new messages since the high-water mark, or the first import.
            if let cursor = state.cursorsBySource[key] {
                if await pump(source: source, token: token, identity: identity, key: key,
                              fetch: { try source.fetchNewMessages(conversationIds: chatIds, afterCursor: cursor, limit: Config.batchSize) }) { return true }
            } else {
                if await pump(source: source, token: token, identity: identity, key: key,
                              fetch: { try source.fetchRecent(conversationIds: chatIds, limit: Config.initialImportLimit) }) { return true }
            }

            // 2) BACKWARD — one history batch per cycle, so a long thread fills in
            //    without ever blocking the newest messages.
            if state.backfillDoneByKey[key] != true, let floor = state.backfillFloorByKey[key] {
                let older: [SourceMessage]
                do { older = try source.fetchOlder(conversationIds: chatIds, beforeCursor: floor, limit: Config.batchSize) }
                catch { setError("History read failed: \(error)"); return true }
                if older.isEmpty {
                    state.backfillDoneByKey[key] = true
                    state.save()
                } else if await upload(older, identity: identity, key: key, token: token, advanceForward: false) {
                    return true
                }
            }
        }
        return false
    }

    /// Drain one direction until the source stops returning full batches.
    private func pump(source: MessageSource, token: String, identity: String, key: String,
                      fetch: () throws -> [SourceMessage]) async -> Bool {
        let batch: [SourceMessage]
        do { batch = try fetch() } catch { setError("Read failed: \(error)"); return true }
        if batch.isEmpty { return false }
        return await upload(batch, identity: identity, key: key, token: token, advanceForward: true)
    }

    /// Upload one batch and move the conversation's marks. Returns true to stop.
    ///
    /// The identity is stamped HERE rather than read per message: for a 1:1 chat it
    /// is the counterpart for both directions, and outbound rows carry handle_id 0
    /// so there is nothing to read off the message itself.
    private func upload(_ batch: [SourceMessage], identity: String, key: String,
                        token: String, advanceForward: Bool) async -> Bool {
        let stamped = batch.map {
            SourceMessage(guid: $0.guid, phone: identity, isFromMe: $0.isFromMe,
                          body: $0.body, sentAt: $0.sentAt, cursor: $0.cursor)
        }
        switch await backend.ingest(stamped, token: token) {
        case .ok(let outcome):
            if !outcome.syncEnabled { await heartbeat(); return true }
            // Marks advance ONLY on ACK, so a failed upload is simply retried.
            let lo = stamped.map { $0.cursor }.min() ?? 0
            let hi = stamped.map { $0.cursor }.max() ?? 0
            if advanceForward {
                state.cursorsBySource[key] = max(state.cursorsBySource[key] ?? 0, hi)
            }
            state.backfillFloorByKey[key] = min(state.backfillFloorByKey[key] ?? lo, lo)
            state.save()
            return false
        case .notEntitled(let reason): enterPaused(reason: reason); return true
        case .paused(let reason): setPhase(.paused(reason: reason)); return true
        case .maintenance: setPhase(.maintenance); return true
        case .updateRequired: setPhase(.needsUpdate); return true
        case .unpaired, .revoked: Keychain.clearToken(); setPhase(.disconnected); return true
        case .reset: Keychain.clearToken(); setPhase(.pairingReset); return true
        case .offline: setPhase(.offline); return true // marks not advanced → retry
        case .rateLimited: return true
        case .failure(let msg): setError(msg); return true
        }
    }

    // ── Heartbeat (server-authoritative state) ──────────────────────────────
    private func heartbeat() async {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return }
        // Report our own state alongside the heartbeat. FDA is probed fresh rather
        // than cached, so a permission granted while the app is running is reflected
        // on the next beat without a relaunch — which is what lets the CRM stop
        // showing "Needs Full Disk Access" on its own.
        let fda = sources.contains { $0.isAvailable() }
        switch await backend.status(token: token, phase: status.phase.wireValue, fdaGranted: fda) {
        case .ok(let s):
            state.lastKnownEntitled = s.entitled
            state.lastKnownReason = s.reason
            state.save()
            // The sync allowlist. Refreshed on every heartbeat, so a lead added in
            // the CRM today is discovered on the next beat and ONLY that
            // conversation is backfilled — no rescan of anything else. A lead whose
            // number is removed simply stops appearing; its already-synced CRM
            // history is left untouched.
            identities = s.identities
            if s.updateRequired {
                setPhase(.needsUpdate)
            } else if s.maintenance {
                setPhase(.maintenance)
            } else if s.syncEnabled {
                if isBlockedPhase { setPhase(.idle); await runSyncCycle(force: true) } // auto-resume
            } else if s.syncPaused {
                setPhase(.paused(reason: "device_paused"))
            } else {
                enterPaused(reason: s.reason)
            }
        case .unpaired, .revoked: Keychain.clearToken(); setPhase(.disconnected)
        case .reset: Keychain.clearToken(); setPhase(.pairingReset)
        case .maintenance: setPhase(.maintenance)
        case .updateRequired: setPhase(.needsUpdate)
        case .notEntitled(let r): enterPaused(reason: r)
        case .paused(let r): setPhase(.paused(reason: r))
        case .offline, .rateLimited, .failure: break // keep prior phase
        }
    }

    // ── Outbound (claim → send via Apple Messages → ack) ─────────────────────
    // Serial and reconnect-safe. Local idempotency (OutboxState) guarantees a job
    // is never handed to Messages twice, and pending acks are retried until the
    // server confirms — so a network drop after a real send never resends and
    // never loses the "sent" fact. Nothing here decides eligibility: the server
    // re-validated every returned job at claim time.
    private func runOutboundCycle() async {
        guard isPaired, !outboundRunning, !isBlockedPhase else { return }
        guard let token = Keychain.loadToken() else { return }
        outboundRunning = true
        defer { outboundRunning = false }

        // 1) Retry any acks the server hasn't confirmed yet (survives reconnects).
        await retryPendingAcks(token: token)

        // 2) Claim approved jobs and send them one at a time.
        switch await backend.claimOutbound(token: token) {
        case .ok(let jobs):
            for job in jobs { await handleJob(job, token: token) }
        case .notEntitled(let reason): enterPaused(reason: reason)
        case .paused(let reason): setPhase(.paused(reason: reason))
        case .maintenance: setPhase(.maintenance)
        case .updateRequired: setPhase(.needsUpdate)
        case .unpaired, .revoked: Keychain.clearToken(); setPhase(.disconnected)
        case .reset: Keychain.clearToken(); setPhase(.pairingReset)
        case .offline, .rateLimited, .failure: break // keep prior phase; retry next tick
        }
    }

    private func handleJob(_ job: OutboundJob, token: String) async {
        // Local idempotency: if this device already sent this key, never resend —
        // only ensure the server ack is (re)delivered.
        if outbox.hasSent(job.idempotencyKey) {
            let existing = outbox.pendingAcks.first { $0.intentId == job.intentId }
            let ack = existing ?? PendingAck(intentId: job.intentId, idempotencyKey: job.idempotencyKey,
                                             status: "sent", localSentAt: iso.string(from: Date()), error: nil)
            outbox.enqueueAck(ack); outbox.save()
            await confirmAck(ack, token: token)
            return
        }

        let result = await AppleMessagesSender.send(to: job.toPhone, body: job.body)
        let now = iso.string(from: Date())
        switch result {
        case .success:
            // Commit the send fact LOCALLY before acking, so a crash before the ack
            // cannot cause a resend (next cycle re-acks instead).
            outbox.markSentLocally(job.idempotencyKey)
            let ack = PendingAck(intentId: job.intentId, idempotencyKey: job.idempotencyKey,
                                 status: "sent", localSentAt: now, error: nil)
            outbox.enqueueAck(ack); outbox.save()
            await confirmAck(ack, token: token)
        case .failure(let msg):
            AppLog.error("Outbound send failed (\(job.stepKey)): \(msg)")
            let ack = PendingAck(intentId: job.intentId, idempotencyKey: job.idempotencyKey,
                                 status: "failed", localSentAt: now, error: msg)
            outbox.enqueueAck(ack); outbox.save()
            await confirmAck(ack, token: token)
        }
    }

    private func retryPendingAcks(token: String) async {
        for ack in outbox.pendingAcks { await confirmAck(ack, token: token) }
    }

    /// Deliver one ack; on server confirmation, drop it from the local ledger.
    private func confirmAck(_ ack: PendingAck, token: String) async {
        let res = await backend.ackOutbound(
            intentId: ack.intentId, idempotencyKey: ack.idempotencyKey,
            status: ack.status, localSentAt: ack.localSentAt, error: ack.error, token: token)
        switch res {
        case .ok:
            outbox.removeAck(intentId: ack.intentId); outbox.save()
        default:
            break // leave it queued; retried next cycle
        }
    }

    private var isBlockedPhase: Bool {
        switch status.phase {
        case .paused, .maintenance, .needsUpdate, .disconnected, .pairingReset, .offline: return true
        default: return false
        }
    }

    private func enterPaused(reason: String) {
        state.lastKnownEntitled = false
        state.lastKnownReason = reason
        state.save()
        setPhase(.paused(reason: reason))
    }

    /// Set the phase, notifying observers ONLY when it actually changed.
    ///
    /// The unguarded version fired `onChange` on every poll, and `onChange` is
    /// `rebuildMenu`, whose last act is `statusItem.menu = menu`. Replacing an
    /// NSStatusItem's menu while that menu is open cancels tracking — so an
    /// unpaired app (which re-asserts `.needsPairing` every 30s) could close its
    /// own menu out from under the pointer, and the click on "Connect Locator
    /// Beast…" would never dispatch. SyncPhase is Equatable, so this is exact,
    /// including the `paused(reason:)` associated value.
    private func setPhase(_ phase: SyncPhase) {
        guard status.phase != phase else { return }
        status.phase = phase
        onChange?()
    }
    private func setError(_ msg: String) {
        AppLog.error(msg)
        state.lastSyncError = msg
        status.lastError = msg
        status.phase = .offline
        onChange?()
    }
}
