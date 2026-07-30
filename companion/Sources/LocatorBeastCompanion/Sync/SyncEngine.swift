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
    private let backend = BackendClient()

    private var syncTimer: Timer?
    private var heartbeatTimer: Timer?
    private var isRunning = false

    private(set) var status = EngineStatus()
    var onChange: (() -> Void)?

    init(sources: [MessageSource]) {
        self.sources = sources
        self.state = SyncState.load()
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
    private func syncSource(_ source: MessageSource) async -> Bool {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return true }
        var cursor = state.cursor(for: source.sourceId)
        while true {
            let batch: [SourceMessage]
            do { batch = try source.fetchNewMessages(afterCursor: cursor, limit: Config.batchSize) }
            catch { setError("Read failed: \(error)"); return true }
            if batch.isEmpty { return false }

            switch await backend.ingest(batch, token: token) {
            case .ok(let outcome):
                if !outcome.syncEnabled { await heartbeat(); return true } // server paused us
                cursor = batch.last!.cursor          // advance ONLY on ACK
                state.cursorsBySource[source.sourceId] = cursor
                state.save()
                if batch.count < Config.batchSize { return false }
            case .notEntitled(let reason): enterPaused(reason: reason); return true
            case .paused(let reason): setPhase(.paused(reason: reason)); return true
            case .maintenance: setPhase(.maintenance); return true
            case .updateRequired: setPhase(.needsUpdate); return true
            case .unpaired, .revoked: Keychain.clearToken(); setPhase(.disconnected); return true
            case .reset: Keychain.clearToken(); setPhase(.pairingReset); return true
            case .offline: setPhase(.offline); return true // cursor not advanced → retry
            case .rateLimited: return true
            case .failure(let msg): setError(msg); return true
            }
        }
    }

    // ── Heartbeat (server-authoritative state) ──────────────────────────────
    private func heartbeat() async {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return }
        switch await backend.status(token: token) {
        case .ok(let s):
            state.lastKnownEntitled = s.entitled
            state.lastKnownReason = s.reason
            state.save()
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

    private func setPhase(_ phase: SyncPhase) { status.phase = phase; onChange?() }
    private func setError(_ msg: String) {
        AppLog.error(msg)
        state.lastSyncError = msg
        status.lastError = msg
        status.phase = .offline
        onChange?()
    }
}
