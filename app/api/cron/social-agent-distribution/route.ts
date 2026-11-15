export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { NextResponse, type NextRequest } from "next/server"
import { runAgentDistribution, type RunMode } from "@/lib/social/agentDistributionRun"
import { AGENT_QUEUE_DAYS, AGENT_COOLDOWN_DAYS } from "@/lib/social/agentDistribution"

/**
 * SOCIAL BEAST — AGENT DISTRIBUTION.
 *
 * Keeps each external agent's own slots filled from content the operator has already approved.
 * It is not a publisher and it is not a renderer: it creates post rows and nothing else. The
 * existing publish workers decide what actually goes out, under every gate they already apply.
 *
 * IT CANNOT TOUCH THE OPERATOR'S WORKFLOW. Every row it writes has an EXTERNAL agent's
 * connection_id; planAgentDistribution refuses any connection whose agent is its own owner,
 * which is what both live destinations are.
 *
 * ── NOT SCHEDULED, AND INERT BY DEFAULT ─────────────────────────────────────────────────────
 * Deliberately absent from vercel.json: nothing invokes this on a timer. On top of that it needs
 * SOCIAL_AGENT_DISTRIBUTION_ENABLED to be exactly "true" before it will write anything, and the
 * default mode is a dry run even then. Three independent reasons a deploy of this file changes
 * nothing, which is what makes it safe to ship ahead of the decision to use it.
 */
function distributionEnabled(): boolean {
  return (process.env.SOCIAL_AGENT_DISTRIBUTION_ENABLED ?? "").trim() === "true"
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  // FAIL CLOSED on a missing secret, the same shape as every other cron here.
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ?mode=persist is the ONLY way to write, and it still requires the flag below.
  const requested = new URL(req.url).searchParams.get("mode")
  const mode: RunMode = requested === "persist" ? "persist" : "preview"

  if (mode === "persist" && !distributionEnabled()) {
    return NextResponse.json({
      ok: true,
      skipped: "distribution_disabled",
      note: "SOCIAL_AGENT_DISTRIBUTION_ENABLED is not 'true' — refusing to write. Run without ?mode=persist for a dry run.",
    })
  }

  try {
    const result = await runAgentDistribution({ mode })
    return NextResponse.json({
      ok: true,
      mode: result.mode,
      agentConnections: result.agentConnections,
      eligibleSources: result.eligibleSources,
      planned: result.plan.planned.length,
      inserted: result.inserted.length,
      rejected: result.rejected,
      // An agent whose queue cannot be filled is REPORTED, never served repeated content.
      unfilled: result.plan.unfilled,
      queueDays: AGENT_QUEUE_DAYS,
      cooldownDays: AGENT_COOLDOWN_DAYS,
      plan: result.plan.planned,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: "agent_distribution_failed", detail: (e as Error).message }, { status: 500 })
  }
}
