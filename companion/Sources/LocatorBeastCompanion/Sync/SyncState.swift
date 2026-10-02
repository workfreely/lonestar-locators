import Foundation

// Durable local state: per-source high-water cursor + last-sync info +
// last-known entitlement (for display only — the server is authoritative).
//
// No separate outbox is needed: chat.db is itself the durable store, and the
// cursor only advances after the server ACKs. On failure/offline we simply
// don't advance, so the next run re-reads the same rows. At-least-once delivery
// is safe because the backend dedups on message.guid.
struct SyncState: Codable {
    // Forward high-water mark, keyed "apple_messages:+17707786743" — ONE PER
    // CLIENT CONVERSATION. The old global "apple_messages" key drove a
    // ROWID-0-forward replay of the entire Mac; it is retired on load.
    var cursorsBySource: [String: Int64] = [:]
    /// Lowest ROWID imported per conversation key — the floor history fills down from.
    var backfillFloorByKey: [String: Int64] = [:]
    /// Conversations whose history has been walked back to the beginning.
    var backfillDoneByKey: [String: Bool] = [:]
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
              var state = try? JSONDecoder().decode(SyncState.self, from: data) else {
            return SyncState()
        }
        // RETIRE THE GLOBAL CURSOR. Builds before targeted sync stored a single
        // "apple_messages" high-water mark and replayed the whole Mac from ROWID 0.
        // Dropping it means the first targeted cycle treats every allowlisted
        // conversation as new and imports it newest-first, instead of resuming a
        // full-history crawl that would upload unrelated personal messages again.
        state.cursorsBySource.removeValue(forKey: "apple_messages")
        return state
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: Self.fileURL, options: .atomic)
    }
}
