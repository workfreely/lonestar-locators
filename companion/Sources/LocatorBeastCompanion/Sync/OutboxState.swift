import Foundation

// Durable LOCAL outbound state — the device's own idempotency + ack-retry ledger,
// separate from SyncState (which is inbound cursors). Two jobs:
//
//   sentKeys    — idempotency keys this device has ALREADY handed to Apple Messages
//                 successfully. Consulted before every send so a job is never sent
//                 twice locally, even if the server ack failed and the job is seen
//                 again (e.g. after a crash/restart between send and ack).
//   pendingAcks — sends whose server acknowledgment has not yet been confirmed.
//                 Retried every outbound cycle until the server accepts them, so a
//                 network drop after a real send never loses the "sent" fact and
//                 never causes a resend.
//
// This is what makes reconnect safe: the send fact is committed locally BEFORE the
// ack, and the ack is idempotent server-side.
struct PendingAck: Codable, Equatable {
    let intentId: String
    let idempotencyKey: String
    var status: String   // "sent" | "failed"
    let localSentAt: String   // ISO8601, the confirmed local send time
    var error: String?
}

struct OutboxState: Codable {
    var sentKeys: [String] = []          // stored as array (Set isn't Codable-friendly for JSON here)
    var pendingAcks: [PendingAck] = []

    func hasSent(_ idempotencyKey: String) -> Bool { sentKeys.contains(idempotencyKey) }

    mutating func markSentLocally(_ idempotencyKey: String) {
        if !sentKeys.contains(idempotencyKey) { sentKeys.append(idempotencyKey) }
        // Bound unbounded growth; keep a generous recent window.
        if sentKeys.count > 5000 { sentKeys.removeFirst(sentKeys.count - 5000) }
    }

    mutating func enqueueAck(_ ack: PendingAck) {
        if let i = pendingAcks.firstIndex(where: { $0.intentId == ack.intentId }) {
            pendingAcks[i] = ack
        } else {
            pendingAcks.append(ack)
        }
    }

    mutating func removeAck(intentId: String) {
        pendingAcks.removeAll { $0.intentId == intentId }
    }

    // ── Persistence (JSON in Application Support) ────────────────────────────
    private static var fileURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("LocatorBeastCompanion", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("outbox-state.json")
    }

    static func load() -> OutboxState {
        guard let data = try? Data(contentsOf: fileURL),
              let state = try? JSONDecoder().decode(OutboxState.self, from: data) else {
            return OutboxState()
        }
        return state
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: Self.fileURL, options: .atomic)
    }
}
