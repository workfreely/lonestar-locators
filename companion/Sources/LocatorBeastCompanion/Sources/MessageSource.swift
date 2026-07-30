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

    // Fetch up to `limit` messages with cursor > `afterCursor`, ascending.
    // Throws on a hard read error (e.g. permission lost mid-run).
    func fetchNewMessages(afterCursor: Int64, limit: Int) throws -> [SourceMessage]
}

enum MessageSourceError: Error {
    case notAvailable(String)
    case readFailed(String)
}
