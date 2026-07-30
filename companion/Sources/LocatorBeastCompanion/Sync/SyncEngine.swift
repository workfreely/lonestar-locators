import Foundation

enum SyncPhase: Equatable {
    case needsPairing
    case needsFullDiskAccess
    case needsUpdate
    case paused(reason: String)   // entitlement lapsed — server authoritative
    case idle
    case syncing
    case offline
}

struct EngineStatus: Equatable {
    var phase: SyncPhase = .needsPairing
    var lastSyncAt: Date?
    var lastError: String?
    var reason: String = ""
}

// Orchestrates all MessageSources → backend. V1 registers only
// AppleMessagesSource, but nothing here is Apple-specific, so Gmail/Outlook/
// CallSummary sources drop in by conforming to MessageSource and being added to
// `sources`.
//
// Entitlement is SERVER-AUTHORITATIVE: we pause on any 403 / entitled:false from
// ingest, keep re-checking /status on an interval, and auto-resume the moment
// the server says we're entitled again — no repair/reinstall needed.
@MainActor
final class SyncEngine {
    private let sources: [MessageSource]
    private var state: SyncState
    private let backend = BackendClient()

    private var syncTimer: Timer?
    private var entitlementTimer: Timer?
    private var isRunning = false

    private(set) var status = EngineStatus()
    var onChange: (() -> Void)?

    init(sources: [MessageSource]) {
        self.sources = sources
        self.state = SyncState.load()
        self.status.lastSyncAt = state.lastSyncAt
    }

    var isPaired: Bool { Keychain.loadToken() != nil }

    // ── Lifecycle ─────────────────────────────────────────────────────────
    func start() {
        syncTimer = Timer.scheduledTimer(withTimeInterval: Config.syncInterval, repeats: true) { [weak self] _ in
            Task { await self?.runSyncCycle(force: false) }
        }
        entitlementTimer = Timer.scheduledTimer(withTimeInterval: Config.entitlementInterval, repeats: true) { [weak self] _ in
            Task { await self?.recheckEntitlement() }
        }
        Task { await runSyncCycle(force: true) }
    }

    func manualRefresh() {
        Task { await runSyncCycle(force: true) }
    }

    func onPaired() {
        // Fresh pairing — resume immediately.
        Task { await runSyncCycle(force: true) }
    }

    // ── Core cycle ────────────────────────────────────────────────────────
    private func runSyncCycle(force: Bool) async {
        guard isPaired else { setPhase(.needsPairing); return }
        if isRunning && !force { return }
        isRunning = true
        defer { isRunning = false }

        guard FullDiskAccess.isGranted() else { setPhase(.needsFullDiskAccess); return }

        // If currently paused for entitlement, confirm via /status before doing work.
        if case .paused = status.phase {
            await recheckEntitlement()
            if case .paused = status.phase { return }
        }

        setPhase(.syncing)
        for source in sources where source.isAvailable() {
            let stop = await syncSource(source)
            if stop { return } // paused / unpaired / offline — stop this cycle
        }

        state.lastSyncAt = Date()
        state.lastSyncError = nil
        state.save()
        status.lastSyncAt = state.lastSyncAt
        setPhase(.idle)
    }

    /// Returns true if the whole cycle should stop (pause/unpaired/offline).
    private func syncSource(_ source: MessageSource) async -> Bool {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return true }

        var cursor = state.cursor(for: source.sourceId)
        while true {
            let batch: [SourceMessage]
            do {
                batch = try source.fetchNewMessages(afterCursor: cursor, limit: Config.batchSize)
            } catch {
                setError("Read failed: \(error)")
                return true
            }
            if batch.isEmpty { return false } // caught up

            switch await backend.ingest(batch, token: token) {
            case .ok(let outcome):
                if !outcome.entitled { enterPaused(reason: state.lastKnownReason); return true }
                // Advance cursor ONLY after ACK (at-least-once; guid dedups).
                cursor = batch.last!.cursor
                state.cursorsBySource[source.sourceId] = cursor
                state.save()
                if batch.count < Config.batchSize { return false } // drained
            case .notEntitled(let reason):
                enterPaused(reason: reason); return true
            case .unpaired:
                Keychain.clearToken(); setPhase(.needsPairing); return true
            case .offline:
                setPhase(.offline); return true // cursor NOT advanced — retry next tick
            case .rateLimited:
                return true // back off; next scheduled tick retries
            case .failure(let msg):
                setError(msg); return true
            }
        }
    }

    // ── Entitlement (server-authoritative) ──────────────────────────────────
    private func recheckEntitlement() async {
        guard let token = Keychain.loadToken() else { setPhase(.needsPairing); return }
        switch await backend.status(token: token) {
        case .ok(let s):
            state.lastKnownEntitled = s.entitled
            state.lastKnownReason = s.reason
            state.save()
            if versionLessThan(Config.appVersion, s.minVersion) {
                setPhase(.needsUpdate)
            } else if s.entitled {
                if isPausedPhase { setPhase(.idle); await runSyncCycle(force: true) } // auto-resume
            } else {
                enterPaused(reason: s.reason)
            }
        case .notEntitled(let reason):
            enterPaused(reason: reason)
        case .unpaired:
            Keychain.clearToken(); setPhase(.needsPairing)
        case .offline, .rateLimited, .failure:
            break // keep prior phase; try again next interval
        }
    }

    private var isPausedPhase: Bool { if case .paused = status.phase { return true }; return false }

    private func enterPaused(reason: String) {
        state.lastKnownEntitled = false
        state.lastKnownReason = reason
        state.save()
        setPhase(.paused(reason: reason))
    }

    // ── Status plumbing ─────────────────────────────────────────────────────
    private func setPhase(_ phase: SyncPhase) {
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

// Minimal semver "a < b" for the update kill-switch.
func versionLessThan(_ a: String, _ b: String) -> Bool {
    let pa = a.split(separator: ".").map { Int($0) ?? 0 }
    let pb = b.split(separator: ".").map { Int($0) ?? 0 }
    for i in 0..<max(pa.count, pb.count) {
        let x = i < pa.count ? pa[i] : 0
        let y = i < pb.count ? pb[i] : 0
        if x != y { return x < y }
    }
    return false
}
