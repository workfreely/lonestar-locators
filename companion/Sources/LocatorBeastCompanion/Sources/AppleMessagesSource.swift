import Foundation
import SQLite3

// Reads ~/Library/Messages/chat.db read-only. Incremental by message.ROWID
// (monotonic), so each run only fetches rows newer than the cursor. Requires
// Full Disk Access — isAvailable() returns false (not a crash) when it's not
// granted, so onboarding can prompt for it.
//
// This is a Swift port of lib/messages/getTranscript.ts (kept as the reference
// oracle); same tapback filtering, attributedBody extraction, and Apple-epoch
// conversion.
final class AppleMessagesSource: MessageSource {
    let sourceId = "apple_messages"
    let displayName = "Apple Messages"

    private var dbPath: String {
        (NSHomeDirectory() as NSString).appendingPathComponent("Library/Messages/chat.db")
    }

    func isAvailable() -> Bool {
        var db: OpaquePointer?
        defer { if db != nil { sqlite3_close(db) } }
        let rc = sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil)
        return rc == SQLITE_OK
    }

    // ── Conversation resolution ──────────────────────────────────────────────
    //
    // Resolve the server's canonical phone allowlist to local 1:1 chat ids.
    //
    // handle.id is stored inconsistently by Messages ("+17707786743",
    // "7707786743", "(770) 778-6743", or an Apple ID email), so handles are
    // normalized HERE and compared against the allowlist. This normalization is a
    // LOCAL READ FILTER ONLY — it decides which conversations to open, nothing
    // else. Canonical attribution still happens server-side under the phone
    // identity rules; the Mac never asserts which lead a message belongs to.
    //
    // V1 is 1:1 ONLY: the HAVING COUNT(*) = 1 clause excludes group chats, so a
    // thread containing a client plus other people is never read.
    func resolveConversations(identities: [String]) throws -> [String: [Int64]] {
        if identities.isEmpty { return [:] }
        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, db != nil else {
            throw MessageSourceError.notAvailable("Cannot open chat.db — grant Full Disk Access.")
        }
        defer { sqlite3_close(db) }

        let wanted = Set(identities)
        var out: [String: [Int64]] = [:]

        let sql = """
        SELECT h.id, chj.chat_id
        FROM chat_handle_join chj
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE chj.chat_id IN (
            SELECT chat_id FROM chat_handle_join GROUP BY chat_id HAVING COUNT(*) = 1
        )
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw MessageSourceError.readFailed("resolve prepare failed: \(String(cString: sqlite3_errmsg(db)))")
        }
        defer { sqlite3_finalize(stmt) }
        while sqlite3_step(stmt) == SQLITE_ROW {
            guard let raw = columnText(stmt, 0) else { continue }
            let chatId = sqlite3_column_int64(stmt, 1)
            guard let canonical = Self.normalizeHandle(raw), wanted.contains(canonical) else { continue }
            out[canonical, default: []].append(chatId)
        }
        return out
    }

    /// Digits-only normalization mirroring lib/messages/getTranscript.ts.
    /// Returns nil for anything that cannot be a US phone (e.g. email handles),
    /// which simply means "no local match" — never an upload.
    static func normalizeHandle(_ raw: String) -> String? {
        if raw.contains("@") { return nil }
        let digits = raw.filter { $0.isNumber }
        if digits.count == 10 { return "+1\(digits)" }
        if digits.count == 11 && digits.hasPrefix("1") { return "+\(digits)" }
        if digits.count > 11 { return "+\(digits)" }
        return nil
    }

    // ── Scoped reads ─────────────────────────────────────────────────────────
    func fetchRecent(conversationIds: [Int64], limit: Int) throws -> [SourceMessage] {
        try read(conversationIds: conversationIds, bound: nil, ascending: false, limit: limit)
    }

    func fetchNewMessages(conversationIds: [Int64], afterCursor: Int64, limit: Int) throws -> [SourceMessage] {
        try read(conversationIds: conversationIds, bound: (">", afterCursor), ascending: true, limit: limit)
    }

    func fetchOlder(conversationIds: [Int64], beforeCursor: Int64, limit: Int) throws -> [SourceMessage] {
        try read(conversationIds: conversationIds, bound: ("<", beforeCursor), ascending: false, limit: limit)
    }

    /// One scoped reader for all three directions. Joins through
    /// chat_message_join so BOTH directions are captured — outbound messages have
    /// handle_id = 0, so filtering on message.handle_id would silently drop every
    /// message the locator sent.
    private func read(conversationIds: [Int64], bound: (String, Int64)?, ascending: Bool, limit: Int) throws -> [SourceMessage] {
        if conversationIds.isEmpty { return [] }
        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, db != nil else {
            throw MessageSourceError.notAvailable("Cannot open chat.db — grant Full Disk Access.")
        }
        defer { sqlite3_close(db) }

        let chatPlaceholders = conversationIds.map { _ in "?" }.joined(separator: ",")
        let boundClause = bound.map { " AND m.ROWID \($0.0) ?" } ?? ""
        let order = ascending ? "ASC" : "DESC"
        let sql = """
        SELECT m.ROWID, m.guid, m.text, m.attributedBody, m.is_from_me, m.date, m.associated_message_type
        FROM message m
        JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
        WHERE cmj.chat_id IN (\(chatPlaceholders))\(boundClause)
        ORDER BY m.ROWID \(order)
        LIMIT ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else {
            throw MessageSourceError.readFailed("prepare failed: \(String(cString: sqlite3_errmsg(db)))")
        }
        defer { sqlite3_finalize(stmt) }

        var idx: Int32 = 1
        for id in conversationIds { sqlite3_bind_int64(stmt, idx, id); idx += 1 }
        if let bound { sqlite3_bind_int64(stmt, idx, bound.1); idx += 1 }
        sqlite3_bind_int64(stmt, idx, Int64(limit))

        var out: [SourceMessage] = []
        while sqlite3_step(stmt) == SQLITE_ROW {
            let rowid = sqlite3_column_int64(stmt, 0)
            let guid = columnText(stmt, 1) ?? "apple-\(rowid)"
            let text = columnText(stmt, 2)
            let attributed = columnBlob(stmt, 3)
            let isFromMe = sqlite3_column_int64(stmt, 4) == 1
            let date = sqlite3_column_int64(stmt, 5)
            let assocType = sqlite3_column_int64(stmt, 6)
            if assocType != 0 { continue } // tapback / reaction — skip
            let body = (text?.isEmpty == false ? text : Self.extractAttributedBody(attributed))
            guard let body, !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { continue }
            out.append(SourceMessage(guid: guid, phone: nil, isFromMe: isFromMe, body: body,
                                     sentAt: Self.appleTimestampToDate(date), cursor: rowid))
        }
        // Always hand back ascending so the engine's high-water logic is uniform.
        return ascending ? out : out.reversed()
    }

    // ── Column helpers ──────────────────────────────────────────────────────
    private func columnText(_ stmt: OpaquePointer?, _ idx: Int32) -> String? {
        guard sqlite3_column_type(stmt, idx) != SQLITE_NULL, let c = sqlite3_column_text(stmt, idx) else { return nil }
        return String(cString: c)
    }

    private func columnBlob(_ stmt: OpaquePointer?, _ idx: Int32) -> Data? {
        guard sqlite3_column_type(stmt, idx) != SQLITE_NULL, let ptr = sqlite3_column_blob(stmt, idx) else { return nil }
        let count = Int(sqlite3_column_bytes(stmt, idx))
        return Data(bytes: ptr, count: count)
    }

    // ── attributedBody extraction (ported from getTranscript.ts) ─────────────
    static func extractAttributedBody(_ data: Data?) -> String? {
        guard let data, !data.isEmpty else { return nil }
        let bytes = [UInt8](data)
        // Find the NSString marker 0x01 0x86, else fall back to 0x86.
        var idx: Int
        if let m = indexOf(bytes, [0x01, 0x86]) {
            idx = m + 2
        } else if let m2 = indexOf(bytes, [0x86]) {
            idx = m2
        } else {
            return nil
        }
        idx += 1 // skip the 1-byte length field
        guard idx < bytes.count else { return nil }
        var end = idx
        while end < bytes.count {
            let b = bytes[end]
            if b == 0x00 { break }
            if b < 0x09 { break }
            end += 1
        }
        guard end > idx else { return nil }
        let slice = Data(bytes[idx..<end])
        guard let s = String(data: slice, encoding: .utf8),
              s.rangeOfCharacter(from: CharacterSet.whitespacesAndNewlines.inverted) != nil else { return nil }
        return s
    }

    private static func indexOf(_ haystack: [UInt8], _ needle: [UInt8]) -> Int? {
        guard !needle.isEmpty, haystack.count >= needle.count else { return nil }
        for i in 0...(haystack.count - needle.count) {
            var match = true
            for j in 0..<needle.count where haystack[i + j] != needle[j] { match = false; break }
            if match { return i }
        }
        return nil
    }

    // ── Apple epoch (ns since 2001-01-01) -> Date ────────────────────────────
    private static let appleEpochOffset: Double = 978307200
    static func appleTimestampToDate(_ ts: Int64) -> Date {
        let n = Double(ts)
        let seconds = n > 1e10 ? n / 1e9 : n
        return Date(timeIntervalSince1970: seconds + appleEpochOffset)
    }
}
