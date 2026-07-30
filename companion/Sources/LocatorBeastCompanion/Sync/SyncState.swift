import Foundation

// Durable local state: per-source high-water cursor + last-sync info +
// last-known entitlement (for display only — the server is authoritative).
//
// No separate outbox is needed: chat.db is itself the durable store, and the
// cursor only advances after the server ACKs. On failure/offline we simply
// don't advance, so the next run re-reads the same rows. At-least-once delivery
// is safe because the backend dedups on message.guid.
struct SyncState: Codable {
    var cursorsBySource: [String: Int64] = [:]
    var lastSyncAt: Date?
    var lastSyncError: String?
    var lastKnownEntitled: Bool = true
    var lastKnownReason: String = "trialing"

    func cursor(for sourceId: String) -> Int64 { cursorsBySource[sourceId] ?? 0 }

    // ── Persistence (JSON in Application Support) ────────────────────────────
    private static var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocatorBeastCompanion", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("sync-state.json")
    }

    static func load() -> SyncState {
        guard let data = try? Data(contentsOf: fileURL),
              let state = try? JSONDecoder().decode(SyncState.self, from: data) else {
            return SyncState()
        }
        return state
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: Self.fileURL, options: .atomic)
    }
}
