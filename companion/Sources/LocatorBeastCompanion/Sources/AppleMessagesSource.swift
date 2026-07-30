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

    func fetchNewMessages(afterCursor: Int64, limit: Int) throws -> [SourceMessage] {
        var db: OpaquePointer?
        guard sqlite3_open_v2(dbPath, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK, db != nil else {
            throw MessageSourceError.notAvailable("Cannot open chat.db — grant Full Disk Access.")
        }
        defer { sqlite3_close(db) }

        // 1) Distinct new messages, ordered + limited on messages (not joins).
        let msgSQL = """
        SELECT m.ROWID, m.guid, m.text, m.attributedBody, m.is_from_me, m.date, m.associated_message_type
        FROM message m
        WHERE m.ROWID > ?
        ORDER BY m.ROWID ASC
        LIMIT ?
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, msgSQL, -1, &stmt, nil) == SQLITE_OK else {
            throw MessageSourceError.readFailed("prepare failed: \(String(cString: sqlite3_errmsg(db)))")
        }
        sqlite3_bind_int64(stmt, 1, afterCursor)
        sqlite3_bind_int64(stmt, 2, Int64(limit))

        struct Raw { let rowid: Int64; let guid: String; let body: String?; let fromMe: Bool; let date: Int64 }
        var raws: [Raw] = []
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

            raws.append(Raw(rowid: rowid, guid: guid, body: body, fromMe: isFromMe, date: date))
        }
        sqlite3_finalize(stmt)

        if raws.isEmpty { return [] }

        // 2) Resolve one handle (phone/email) per message via its chat.
        let handleByMessage = try resolveHandles(db: db, rowids: raws.map { $0.rowid })

        return raws.map { r in
            SourceMessage(
                guid: r.guid,
                phone: handleByMessage[r.rowid],
                isFromMe: r.fromMe,
                body: r.body,
                sentAt: Self.appleTimestampToDate(r.date),
                cursor: r.rowid
            )
        }
    }

    // Map message ROWID -> a participant handle (first one) via chat joins. For
    // 1:1 chats this is the counterpart for both sent and received messages.
    private func resolveHandles(db: OpaquePointer?, rowids: [Int64]) throws -> [Int64: String] {
        var result: [Int64: String] = [:]
        let placeholders = rowids.map { _ in "?" }.joined(separator: ",")
        let sql = """
        SELECT cmj.message_id, h.id
        FROM chat_message_join cmj
        JOIN chat_handle_join chj ON chj.chat_id = cmj.chat_id
        JOIN handle h ON h.ROWID = chj.handle_id
        WHERE cmj.message_id IN (\(placeholders))
        """
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK else { return result }
        defer { sqlite3_finalize(stmt) }
        for (i, id) in rowids.enumerated() {
            sqlite3_bind_int64(stmt, Int32(i + 1), id)
        }
        while sqlite3_step(stmt) == SQLITE_ROW {
            let msgId = sqlite3_column_int64(stmt, 0)
            if result[msgId] == nil, let handle = columnText(stmt, 1) {
                result[msgId] = handle
            }
        }
        return result
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
