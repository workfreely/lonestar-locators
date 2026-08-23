// Diagnostics for the service-area save (set_workspace_service_areas RPC).
//
// The point: when the save fails, surface the ACTUAL cause — the real Postgres
// error, which Supabase project the browser is connected to, the workspace the
// RPC would target, and whether the user is a member — instead of guessing
// "missing migration".

import type { PostgrestError } from "@supabase/supabase-js"
import { supabase } from "./client"
import { resolveSupabaseProject, type SupabaseProject } from "./projects"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

// The complete RPC failure shape the user asked to see.
export type RpcFailure = {
  message: string
  code: string | null
  details: string | null
  hint: string | null
  status: number | null
  statusText: string | null
}

export function toRpcFailure(
  error: PostgrestError | null,
  status?: number,
  statusText?: string
): RpcFailure | null {
  if (!error) return null
  return {
    message: error.message ?? "",
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    status: status ?? null,
    statusText: statusText ?? null,
  }
}

// "The function isn't present on the connected database" — PostgREST returns
// PGRST202 / 404 when an RPC is missing (e.g. connected to a DB without the
// migration, like the frozen Lone Star project).
export function isFunctionMissing(f: RpcFailure): boolean {
  const code = f.code ?? ""
  const msg = (f.message ?? "").toLowerCase()
  return (
    code === "PGRST202" ||
    code === "42883" ||
    f.status === 404 ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache") ||
    (msg.includes("function") && msg.includes("does not exist"))
  )
}

// The RPC raises this when current_workspace_id() is null.
export function isNoWorkspace(f: RpcFailure): boolean {
  return (f.message ?? "").toLowerCase().includes("no active workspace")
}

// The RPC raises this named error when more than MAX_SERVICE_AREAS markets are
// submitted. The UI already prevents a sixth from being selected, so reaching
// here means the cap was bypassed — the save is refused, never truncated.
export function isTooManyServiceAreas(f: RpcFailure): boolean {
  const msg = (f.message ?? "").toLowerCase()
  return msg.includes("too_many_service_areas") || msg.includes("workspaces_service_areas_max")
}

// The RPC raises this named error when zero markets are submitted. Both UIs
// prevent it, so reaching here means a guard was bypassed — the save is refused
// rather than leaving the workspace serving nothing (which would make the Smart
// Form fall back to advertising every market).
export function isNoServiceAreas(f: RpcFailure): boolean {
  const msg = (f.message ?? "").toLowerCase()
  return msg.includes("no_service_areas") || msg.includes("workspaces_service_areas_range")
}

// ── User-facing messages ────────────────────────────────────────────────────
// Clean and friendly. NEVER expose project names/refs, RPC names, DB names,
// Postgres codes, or any implementation detail — those go to the dev console
// only (see gatherWorkspaceDiagnostics + likelyCause).
const GENERIC_MESSAGE =
  "Unable to save your Service Areas. Please try again. If the problem continues, contact support."
const WORKSPACE_MESSAGE =
  "Unable to save your Service Areas. Your workspace configuration couldn't be updated. Please try again."
const TOO_MANY_MESSAGE = "You can serve up to 5 markets. Deselect one to choose another."
const NONE_MESSAGE = "Select at least one market."

/**
 * The message shown in the UI, in every environment. Only distinguishes a
 * workspace-configuration problem (which we can safely attribute) from the
 * generic case; no infrastructure details either way.
 */
export function userMessageForServiceAreaError(f: RpcFailure): string {
  if (isNoServiceAreas(f)) return NONE_MESSAGE
  if (isTooManyServiceAreas(f)) return TOO_MANY_MESSAGE
  if (isNoWorkspace(f)) return WORKSPACE_MESSAGE
  return GENERIC_MESSAGE
}

/**
 * A short developer-only classification of the failure, for the console log.
 * Not shown to users.
 */
export function likelyCause(f: RpcFailure): string {
  const project = resolveSupabaseProject(SUPABASE_URL)
  if (isFunctionMissing(f)) {
    return project?.frozen
      ? `function-not-found — connected to the frozen ${project.name} project (${project.ref}); it lacks this RPC. Point NEXT_PUBLIC_SUPABASE_URL at Locator Beast.`
      : `function-not-found — the RPC is absent on ${project?.name ?? "the connected project"}${project ? ` (${project.ref})` : ""} (wrong project or unapplied migration).`
  }
  if (isTooManyServiceAreas(f)) return "more than 5 service areas submitted — refused by the RPC/constraint."
  if (isNoWorkspace(f)) return "no active workspace membership for the current user."
  return "unclassified — inspect the full Postgres error above."
}

export type WorkspaceDiagnostics = {
  project: SupabaseProject | null
  connectedRef: string | null
  matchesLocatorBeast: boolean
  userId: string | null
  userEmail: string | null
  workspaceId: string | null
  isActiveMember: boolean | null
  probeErrors: Record<string, string>
}

const LOCATOR_BEAST_REF = "onwrrajmklxtnabekzcy"

// Gathers everything the user asked to verify: connected project, auth user,
// the workspace the RPC targets (current_workspace_id), and membership. Each
// probe is independent — a probe that itself errors (e.g. because the table/RPC
// doesn't exist on the connected DB) is captured, not thrown, and is itself a
// strong signal you're on the wrong database.
export async function gatherWorkspaceDiagnostics(): Promise<WorkspaceDiagnostics> {
  const project = resolveSupabaseProject(SUPABASE_URL)
  const connectedRef = project?.ref ?? null
  const probeErrors: Record<string, string> = {}
  let userId: string | null = null
  let userEmail: string | null = null
  let workspaceId: string | null = null
  let isActiveMember: boolean | null = null

  try {
    const { data, error } = await supabase.auth.getUser()
    if (error) probeErrors.getUser = error.message
    userId = data?.user?.id ?? null
    userEmail = data?.user?.email ?? null
  } catch (e) {
    probeErrors.getUser = e instanceof Error ? e.message : String(e)
  }

  // The workspace id the RPC would operate on (server-side, from the caller's
  // active membership). Null here means "no active workspace membership".
  try {
    const { data, error } = await supabase.rpc("current_workspace_id")
    if (error) probeErrors.current_workspace_id = error.message
    workspaceId = typeof data === "string" ? data : null
  } catch (e) {
    probeErrors.current_workspace_id = e instanceof Error ? e.message : String(e)
  }

  // Independently confirm the authenticated user has an active membership row.
  if (userId) {
    try {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id, status")
        .eq("user_id", userId)
        .eq("status", "active")
      if (error) probeErrors.workspace_members = error.message
      isActiveMember = Array.isArray(data) ? data.length > 0 : null
      if (!workspaceId && data?.[0]?.workspace_id) workspaceId = data[0].workspace_id
    } catch (e) {
      probeErrors.workspace_members = e instanceof Error ? e.message : String(e)
    }
  }

  return {
    project,
    connectedRef,
    matchesLocatorBeast: connectedRef === LOCATOR_BEAST_REF,
    userId,
    userEmail,
    workspaceId,
    isActiveMember,
    probeErrors,
  }
}
