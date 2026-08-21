import type { VoiceLogEntry } from "./types"

// Alpha usage logging. Persists one row per command to beast_voice_commands via
// the admin-only route, which derives user_id and workspace_id from the session —
// the browser never supplies identity. Raw audio is never captured or stored;
// only the recognizer's text and the capture duration are sent.
//
// Fire-and-forget by design: telemetry must never delay or block a voice command,
// and a logging failure must never surface to the locator as a command failure.
// `keepalive` lets the request survive the page navigation that a successful
// hand-off triggers (selecting the lead pushes a new route).
export function logVoiceCommand(entry: VoiceLogEntry): void {
  if (process.env.NODE_ENV !== "production") console.info("[beast-voice]", entry)

  try {
    void fetch("/api/admin/beast-voice/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {
      /* telemetry is best-effort */
    })
  } catch {
    /* telemetry is best-effort */
  }
}
