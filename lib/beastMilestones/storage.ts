// ─── Beast Milestones — persistence ─────────────────────────────────────────
// Which milestones an account has already unlocked, so each celebrates exactly
// once. Source of truth is the `beast_milestones` table (per-account, RLS), but
// every read/write is mirrored to localStorage so the feature still dedupes
// per-browser if the migration hasn't been applied yet — and demo mode never
// touches the real account's table.

import { supabase } from "@/lib/supabase/client"

const LS_PREFIX = "beast-milestones:"
const lsKey = (scope: string) => `${LS_PREFIX}${scope}`

function readLocal(scope: string): Set<string> {
  try {
    const raw = localStorage.getItem(lsKey(scope))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function writeLocal(scope: string, keys: Set<string>) {
  try {
    localStorage.setItem(lsKey(scope), JSON.stringify([...keys]))
  } catch {
    /* private mode / quota — the DB remains the durable store */
  }
}

// The set of milestone keys already unlocked for this account (union of the DB
// rows and the local mirror). Demo mode is localStorage-only.
export async function fetchUnlockedMilestones(demoMode: boolean): Promise<Set<string>> {
  const scope = demoMode ? "demo" : "live"
  const local = readLocal(scope)
  if (demoMode) return local

  try {
    const { data, error } = await supabase.from("beast_milestones").select("milestone_key")
    // Table missing (migration not applied yet) or any error → localStorage only.
    if (error) return local
    const merged = new Set(local)
    for (const row of data ?? []) merged.add((row as { milestone_key: string }).milestone_key)
    writeLocal(scope, merged) // keep the local mirror in sync
    return merged
  } catch {
    return local
  }
}

// Record a milestone as unlocked. Writes localStorage immediately (so a repeat
// in the same session can't double-fire) and best-effort upserts the DB row;
// the unique (user_id, milestone_key) constraint makes this idempotent.
export async function persistMilestoneUnlocked(key: string, demoMode: boolean): Promise<void> {
  const scope = demoMode ? "demo" : "live"
  const local = readLocal(scope)
  local.add(key)
  writeLocal(scope, local)
  if (demoMode) return

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from("beast_milestones")
      .upsert(
        { user_id: user.id, milestone_key: key },
        { onConflict: "user_id,milestone_key", ignoreDuplicates: true },
      )
  } catch {
    /* non-fatal — localStorage already recorded it for this browser */
  }
}
