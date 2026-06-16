/**
 * scripts/sync-lead-messages.ts
 *
 * Proof-of-concept: read a lead's iMessage conversation from ~/Library/Messages/chat.db
 * and print a clean labeled transcript to stdout.
 *
 * Usage:
 *   npx tsx scripts/sync-lead-messages.ts "+15125551234"
 *   npx tsx scripts/sync-lead-messages.ts "5125551234"
 *
 * Requirements:
 *   - Terminal (or VS Code) must have Full Disk Access in
 *     System Settings → Privacy & Security → Full Disk Access
 *   - npm install --save-dev better-sqlite3 @types/better-sqlite3 tsx
 */

import Database from "better-sqlite3"
import * as os from "os"
import * as path from "path"

// ─── Phone normalization ───────────────────────────────────────────────────────
// iMessage stores numbers in several formats. Strip everything except digits,
// then enforce E.164 (+1XXXXXXXXXX for US numbers).

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  // Already includes country code for non-US numbers
  return `+${digits}`
}

// ─── attributedBody text extraction ──────────────────────────────────────────
// Modern iMessage stores message content as an NSKeyedArchiver blob in
// attributedBody. The plain string is embedded as a UTF-8 run preceded by
// the byte sequence 01 86 (NSString value marker in the plist binary format).
// We scan for that marker and read forward until a non-printable/control byte.

function extractAttributedBodyText(buf: Buffer): string {
  // Search for the canonical marker used in NSAttributedString plists
  const marker = Buffer.from([0x01, 0x86])
  let idx = buf.indexOf(marker)
  if (idx === -1) {
    // Fallback: look for longer preamble pattern (+2 byte length prefix)
    idx = buf.indexOf(Buffer.from([0x86]))
    if (idx === -1) return ""
  } else {
    idx += marker.length
  }

  // Skip a 1-byte length field that Apple emits after the marker
  idx += 1

  // Read until we hit a null byte or a non-UTF-8-printable control character
  const start = idx
  let end = idx
  while (end < buf.length) {
    const b = buf[end]
    // Stop at null terminator or raw control bytes (but allow tab/newline)
    if (b === 0x00) break
    if (b < 0x09) break
    end++
  }

  if (end <= start) return ""
  const candidate = buf.slice(start, end).toString("utf8")
  // Sanity check: must have at least one printable ASCII character
  return /\S/.test(candidate) ? candidate : ""
}

// ─── Apple epoch → JS Date ────────────────────────────────────────────────────
// Apple stores timestamps as nanoseconds since 2001-01-01.
// Older messages (pre-Catalina) use seconds; we detect which by magnitude.

const APPLE_EPOCH_OFFSET_S = 978307200 // seconds between 2001-01-01 and 1970-01-01

function appleTimestampToDate(ts: number | bigint): Date {
  const n = typeof ts === "bigint" ? Number(ts) : ts
  // Values > 1e10 are nanoseconds (modern); smaller values are seconds (legacy)
  const seconds = n > 1e10 ? n / 1e9 : n
  return new Date((seconds + APPLE_EPOCH_OFFSET_S) * 1000)
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
}

// ─── Tapback / reaction detection ─────────────────────────────────────────────
// Tapbacks are stored with a subject that starts with a Unicode object
// replacement character (U+FFFC) or with associated_message_type != 0.
// We skip them since they carry no conversational content.

function isTapback(text: string | null, associatedType: number): boolean {
  if (associatedType !== 0) return true
  if (!text) return false
  // Tapbacks sometimes render as "Loved "...", Liked "...", etc.
  // The raw text is just the reaction label — skip short reaction-only strings
  // that match the known Tapback prefixes Apple uses.
  return /^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned) "/.test(text)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const rawInput = process.argv[2]

  if (!rawInput) {
    console.error("Usage: npx tsx scripts/sync-lead-messages.ts <phone-number>")
    console.error('Example: npx tsx scripts/sync-lead-messages.ts "+14022132830"')
    process.exit(1)
  }

  const dbPath = path.join(os.homedir(), "Library", "Messages", "chat.db")

  let db: Database.Database
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
  } catch (err: any) {
    if (err.message?.includes("SQLITE_CANTOPEN") || err.message?.includes("no such file")) {
      console.error("Cannot open chat.db — grant Full Disk Access to Terminal in System Settings.")
    } else {
      console.error("Failed to open database:", err.message)
    }
    process.exit(1)
  }

  // ── 1. Find matching handles by last-10-digits fuzzy match ───────────────────
  const last10 = rawInput.replace(/\D/g, "").slice(-10)

  // ROWID must be aliased — better-sqlite3 drops the hidden rowid column otherwise
  const allHandles = db
    .prepare("SELECT ROWID AS rowid, id FROM handle")
    .all() as Array<{ rowid: number; id: string }>

  const matchingHandles = allHandles.filter((h) =>
    h.id.replace(/\D/g, "").includes(last10)
  )

  if (matchingHandles.length === 0) {
    console.error(`No handle found for "${rawInput}" (searched last 10 digits: ${last10})`)
    process.exit(1)
  }

  const handleIds = matchingHandles.map((h) => h.rowid)
  const displayId = matchingHandles[0].id

  // ── 2. Resolve chat IDs via chat_handle_join ──────────────────────────────────
  const phHandles = handleIds.map(() => "?").join(", ")
  const chatRows = db
    .prepare(`SELECT DISTINCT chat_id FROM chat_handle_join WHERE handle_id IN (${phHandles})`)
    .all(...handleIds) as Array<{ chat_id: number }>

  if (chatRows.length === 0) {
    console.error("Handle found but has no associated chats in chat_handle_join.")
    process.exit(1)
  }

  const chatIds = chatRows.map((r) => r.chat_id)
  const phChats = chatIds.map(() => "?").join(", ")

  // ── 3. Fetch all messages via chat_message_join ───────────────────────────────
  // Join path: chat_message_join → message (ROWID).
  // We select associated_message_type to detect and skip Tapbacks.
  type MsgRow = {
    rowid: number
    text: string | null
    attributedBody: Buffer | null
    is_from_me: number
    date: number | bigint
    associated_message_type: number
  }

  const rows = db
    .prepare(
      `SELECT
         m.ROWID                    AS rowid,
         m.text,
         m.attributedBody,
         m.is_from_me,
         m.date,
         m.associated_message_type
       FROM message m
       JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
       WHERE cmj.chat_id IN (${phChats})
       ORDER BY m.date ASC`
    )
    .all(...chatIds) as MsgRow[]

  // ── 4. Filter and resolve text ────────────────────────────────────────────────
  type Msg = { date: Date; fromMe: boolean; body: string }

  const messages: Msg[] = []
  for (const row of rows) {
    if (isTapback(row.text, row.associated_message_type)) continue

    const body =
      (row.text?.trim()) ||
      (row.attributedBody ? extractAttributedBodyText(row.attributedBody) : "")

    if (!body) continue

    messages.push({
      date: appleTimestampToDate(row.date),
      fromMe: row.is_from_me === 1,
      body,
    })
  }

  // ── 5. Print transcript ───────────────────────────────────────────────────────
  const divider = "━".repeat(40)

  console.log(divider)
  console.log("iMessage Transcript")
  console.log(`Client: ${displayId}`)
  console.log(`${messages.length} messages`)
  console.log(divider)

  if (messages.length === 0) {
    console.log("\nNo readable messages found.")
    console.log(`(${rows.length} raw rows fetched — all were Tapbacks or attachments)`)
    db.close()
    return
  }

  let lastDayLabel = ""

  for (const msg of messages) {
    const dayLabel = msg.date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })

    if (dayLabel !== lastDayLabel) {
      console.log(`\n── ${dayLabel} ──\n`)
      lastDayLabel = dayLabel
    }

    const time = msg.date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })

    const speaker = msg.fromMe ? "Me" : "Client"
    console.log(`[${speaker} ${time}]`)
    console.log(msg.body)
    console.log()
  }

  const first = messages[0].date
  const last  = messages[messages.length - 1].date
  console.log(divider)
  console.log(`First: ${formatTimestamp(first)}`)
  console.log(`Last:  ${formatTimestamp(last)}`)
  console.log(divider)

  db.close()
}

main()
