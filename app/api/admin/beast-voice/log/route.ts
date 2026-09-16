import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireWorkspaceMember } from "@/lib/auth/requireWorkspaceMember"

// Beast Voice alpha telemetry sink. Writes one beast_voice_commands row per
// spoken command so the grammar can be widened from real usage.
//
// This route touches NO CRM table and runs NO workflow — it is an append-only
// log of what Beast Voice heard and decided. It cannot change a lead, a stage,
// a next action, or a contact record.
//
// Authorization is layered:
//   1. requireWorkspaceMember() — a real session, resolved server-side
//   2. is_platform_admin()      — the alpha is owner-only
//   3. the table's own RLS insert policy, which independently requires
//      is_platform_admin() AND user_id = auth.uid()
// The write uses the caller's RLS-enforced client, never the service role, so
// step 3 is a genuine gate rather than decoration.
//
// user_id and workspace_id come from the session. The body supplies telemetry
// only and is never trusted for identity.

const OUTCOMES = new Set([
  "handed-off",
  "ambiguous",
  "not-found",
  "not-eligible",
  "unparsed",
  "speech-error",
  "cancelled",
  "no-active-prompt",
  "not-valid-for-phase",
  "responded",
  // ── V1 input-layer outcomes (append-only; the column is free text) ─────────
  "executed",
  "no-context",
  "stopped",
  "chain-aborted",
  "deferred",
])
const INTENTS = new Set([
  "contact_client",
  "respond_call",
  "respond_text",
  "confirm_yes",
  "confirm_no",
  "cancel",
  "unknown",
  // ── V1 command-mode intents ────────────────────────────────────────────────
  "navigate",
  "workspace",
  "focus",
  "agenda",
  "theme",
  "add_lead",
  "select_client",
  "copy",
  "crm_open",
  "edit_client",
  "property_action",
  "market",
  "unleash",
  "ask_beast",
  "completion",
  "stop",
])
const PHASES = new Set(["choose-method", "confirm-call", "confirm-text"])
const ACTIONS = new Set(["initiate-contact", "execute"])
const METHODS = new Set(["unspecified", "call", "text"])

/** Trim to a sane column length; transcripts are single spoken commands. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const t = value.trim()
  return t ? t.slice(0, max) : null
}

function nonNegativeInt(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null
  return Math.min(Math.round(value), max)
}

/**
 * Real leads have bigint ids; demo-workspace leads have string ids ("demo-1")
 * that cannot satisfy the foreign key. The numeric id goes in the FK column and
 * the raw value is always kept alongside it, so demo usage is still analyzable.
 */
function leadColumns(raw: unknown): { matched_lead_id: number | null; matched_lead_ref: string | null } {
  if (raw === null || raw === undefined) return { matched_lead_id: null, matched_lead_ref: null }
  const ref = String(raw).slice(0, 64)
  const numeric = /^\d+$/.test(ref) ? Number(ref) : null
  return {
    matched_lead_id: numeric !== null && Number.isSafeInteger(numeric) ? numeric : null,
    matched_lead_ref: ref,
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireWorkspaceMember()
  if (!guard.ok) return guard.response
  const { userId, workspaceId, supabase } = guard

  const { data: isAdmin } = await supabase.rpc("is_platform_admin")
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const transcript = text(body.transcript, 2000)
  const outcome = text(body.outcome, 32)
  const provider = text(body.provider, 64)
  if (!outcome || !OUTCOMES.has(outcome) || !provider) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const parsedIntent = text(body.parsedIntent, 32)
  const requestedAction = text(body.requestedAction, 32)
  const requestedMethod = text(body.requestedMethod, 16)
  const workflowPhase = text(body.workflowPhase, 32)

  const { error } = await supabase.from("beast_voice_commands").insert({
    user_id: userId,
    workspace_id: workspaceId,
    // A speech error can legitimately produce no transcript; the column is NOT
    // NULL, so record it as empty rather than dropping the row and losing the
    // failure from the accuracy data.
    transcript: transcript ?? "",
    parsed_intent: parsedIntent && INTENTS.has(parsedIntent) ? parsedIntent : "unknown",
    requested_action: requestedAction && ACTIONS.has(requestedAction) ? requestedAction : null,
    // Which branch was asked for vs. which the workflow actually ran — the gap
    // is what tells us whether wiring the Call/Text branches is worth doing.
    requested_method: requestedMethod && METHODS.has(requestedMethod) ? requestedMethod : null,
    phrase_id: text(body.phraseId, 64),
    // Which existing question was on screen — without it a bare "yes" in the
    // transcript cannot be interpreted later.
    workflow_phase: workflowPhase && PHASES.has(workflowPhase) ? workflowPhase : null,
    handoff_attempted: body.handoffAttempted === true,
    activation_live: typeof body.activationLive === "boolean" ? body.activationLive : null,
    ...leadColumns(body.matchedLeadId),
    match_count: nonNegativeInt(body.matchedCount, 10_000) ?? 0,
    outcome,
    error_reason: text(body.errorReason, 256),
    handed_off: body.handedOff === true,
    // confirmed / succeeded stay null: observing them would require
    // instrumenting the existing contact workflow, which Beast Voice must not modify.
    provider,
    provider_model: text(body.providerModel, 64),
    audio_duration_ms: nonNegativeInt(body.audioDurationMs, 60 * 60 * 1000),
  })

  if (error) {
    console.error("[beast-voice/log] insert failed:", error.message)
    return NextResponse.json({ error: "Insert failed" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
