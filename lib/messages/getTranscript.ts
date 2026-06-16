import Database from "better-sqlite3"
import * as os from "os"
import * as path from "path"

export type TranscriptResult = {
  transcript: string
  messageCount: number
  lastMessageRowId: number | null
  lastMessageDate: string | null
}

// ─── Helpers (shared with scripts/sync-lead-messages.ts) ─────────────────────

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`
  return `+${digits}`
}

function extractAttributedBodyText(buf: Buffer): string {
  const marker = Buffer.from([0x01, 0x86])
  let idx = buf.indexOf(marker)
  if (idx === -1) {
    idx = buf.indexOf(Buffer.from([0x86]))
    if (idx === -1) return ""
  } else {
    idx += marker.length
  }
  idx += 1
  const start = idx
  let end = idx
  while (end < buf.length) {
    const b = buf[end]
    if (b === 0x00) break
    if (b < 0x09) break
    end++
  }
  if (end <= start) return ""
  const candidate = buf.slice(start, end).toString("utf8")
  return /\S/.test(candidate) ? candidate : ""
}

const APPLE_EPOCH_OFFSET_S = 978307200

function appleTimestampToDate(ts: number | bigint): Date {
  const n = typeof ts === "bigint" ? Number(ts) : ts
  const seconds = n > 1e10 ? n / 1e9 : n
  return new Date((seconds + APPLE_EPOCH_OFFSET_S) * 1000)
}

function isTapback(text: string | null, associatedType: number): boolean {
  if (associatedType !== 0) return true
  if (!text) return false
  return /^(Loved|Liked|Disliked|Laughed at|Emphasized|Questioned) "/.test(text)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getTranscript(phone: string): Promise<TranscriptResult> {
  const dbPath = path.join(os.homedir(), "Library", "Messages", "chat.db")

  let db: Database.Database
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("SQLITE_CANTOPEN") || msg.includes("no such file")) {
      throw new Error(
        "Cannot open chat.db — grant Full Disk Access to this app in System Settings → Privacy & Security → Full Disk Access."
      )
    }
    throw new Error(`Failed to open Messages database: ${msg}`)
  }

  try {
    const last10 = phone.replace(/\D/g, "").slice(-10)
    console.log(`[getTranscript] Searching for phone: ${phone} (last 10 digits: ${last10})`)

    const allHandles = db
      .prepare("SELECT ROWID AS rowid, id FROM handle")
      .all() as Array<{ rowid: number; id: string }>

    const matchingHandles = allHandles.filter((h) =>
      h.id.replace(/\D/g, "").includes(last10)
    )

    if (matchingHandles.length === 0) {
      // Log all handles for diagnostics — helps spot Apple ID emails or alternate formats
      const sample = allHandles.slice(0, 20).map((h) => h.id)
      console.error(
        `[getTranscript] No handles matched ${phone}.\n` +
        `  Searched last-10: ${last10}\n` +
        `  Total handles in chat.db: ${allHandles.length}\n` +
        `  First 20 handles: ${JSON.stringify(sample)}\n` +
        `  Tip: conversation may be stored under an Apple ID email rather than a phone number.`
      )
      throw new Error(
        `No iMessage conversation found for ${phone}. Check server logs for handle diagnostics.`
      )
    }

    console.log(
      `[getTranscript] Matched ${matchingHandles.length} handle(s): ${matchingHandles.map((h) => h.id).join(", ")}`
    )

    const handleIds = matchingHandles.map((h) => h.rowid)
    const phHandles = handleIds.map(() => "?").join(", ")

    const chatRows = db
      .prepare(
        `SELECT DISTINCT chat_id FROM chat_handle_join WHERE handle_id IN (${phHandles})`
      )
      .all(...handleIds) as Array<{ chat_id: number }>

    if (chatRows.length === 0) {
      console.error(
        `[getTranscript] Handles found for ${phone} but no associated chats.\n` +
        `  Handle IDs: ${handleIds.join(", ")}\n` +
        `  This may indicate the conversation was deleted or is in a group chat not yet supported.`
      )
      throw new Error(
        `No iMessage conversation found for ${phone}. Check server logs for handle diagnostics.`
      )
    }

    console.log(`[getTranscript] Found ${chatRows.length} chat(s) for ${phone}.`)

    const chatIds = chatRows.map((r) => r.chat_id)
    const phChats = chatIds.map(() => "?").join(", ")

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

    type Msg = {
      rowid: number
      date: Date
      fromMe: boolean
      body: string
    }

    const messages: Msg[] = []
    for (const row of rows) {
      if (isTapback(row.text, row.associated_message_type)) continue

      const body =
        row.text?.trim() ||
        (row.attributedBody ? extractAttributedBodyText(row.attributedBody) : "")

      if (!body) continue

      messages.push({
        rowid: Number(row.rowid),
        date: appleTimestampToDate(row.date),
        fromMe: row.is_from_me === 1,
        body,
      })
    }

    if (messages.length === 0) {
      console.error(
        `[getTranscript] ${rows.length} raw message row(s) found for ${phone} but none had readable text.\n` +
        `  All messages may be attachments, tapbacks, or have empty attributedBody blobs.`
      )
      throw new Error(
        `No readable messages found for ${phone}. Check server logs for handle diagnostics.`
      )
    }

    console.log(`[getTranscript] Built transcript with ${messages.length} message(s) for ${phone}.`)

    // Build a clean labeled transcript for the AI
    const lines: string[] = []
    let lastDayLabel = ""

    for (const msg of messages) {
      const dayLabel = msg.date.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })

      if (dayLabel !== lastDayLabel) {
        lines.push(`\n[${dayLabel}]`)
        lastDayLabel = dayLabel
      }

      const time = msg.date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })

      const speaker = msg.fromMe ? "Me" : "Client"
      lines.push(`${speaker} (${time}): ${msg.body}`)
    }

    const transcript = lines.join("\n").trim()
    const lastMsg = messages[messages.length - 1]

    return {
      transcript,
      messageCount: messages.length,
      lastMessageRowId: lastMsg.rowid,
      lastMessageDate: lastMsg.date.toISOString(),
    }
  } finally {
    db.close()
  }
}
