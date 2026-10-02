import Foundation

// A normalized message from any source. `guid` is the stable idempotency key the
// backend upserts on. `sourceId` namespaces cursors/guids across sources so
// Apple/Gmail/etc. never collide.
struct SourceMessage: Codable {
    let guid: String
    let phone: String?
    let isFromMe: Bool
    let body: String?
    let sentAt: Date?
    // Opaque, monotonically increasing position within the source (Apple: ROWID).
    // Used only as the local high-water mark; never sent to the server.
    let cursor: Int64
}

// The seam that makes future integrations drop-in. V1 ships only
// AppleMessagesSource; GmailSource / OutlookSource / CallSummarySource conform
// to this same protocol later with zero changes to SyncEngine.
protocol MessageSource {
    // Stable id, e.g. "apple_messages" — namespaces the persisted cursor.
    var sourceId: String { get }

    // Human label for status/logging, e.g. "Apple Messages".
    var displayName: String { get }

    // Whether this source can currently read (e.g. Apple Messages needs Full
    // Disk Access). Sources that can't read are skipped, not fatal.
    func isAvailable() -> Bool

    // ── TARGETED SYNC ────────────────────────────────────────────────────────
    //
    // Reads are scoped to CONVERSATIONS the paired workspace actually knows about.
    // The engine passes the server's phone allowlist; the source resolves it to
    // local conversation ids and never reads anything else. This is what keeps a
    // locator's personal messages on their Mac.

    /// Map each allowlisted identity to its local 1:1 conversation ids.
    /// Identities with no conversation (or only group chats) are simply absent.
    func resolveConversations(identities: [String]) throws -> [String: [Int64]]

    /// Newest-first slice for a conversation's FIRST import, so a client becomes
    /// usable immediately instead of after a full-history replay.
    func fetchRecent(conversationIds: [Int64], limit: Int) throws -> [SourceMessage]

    /// Forward incremental read: cursor > `afterCursor`, ascending.
    func fetchNewMessages(conversationIds: [Int64], afterCursor: Int64, limit: Int) throws -> [SourceMessage]

    /// Backward history fill: cursor < `beforeCursor`, newest-first.
    func fetchOlder(conversationIds: [Int64], beforeCursor: Int64, limit: Int) throws -> [SourceMessage]
}

enum MessageSourceError: Error {
    case notAvailable(String)
    case readFailed(String)
}
