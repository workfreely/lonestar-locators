// MAY THIS RENDER GO TO THIS DESTINATION?
//
// One definition, asked at three points — planning, rendering, publishing — so the planner cannot
// queue something the publisher will refuse, and the publisher cannot be the only thing standing
// between an agent's audience and somebody else's face. The same shape lib/social/postLane.ts
// uses for "rendered", and for the same reason: two definitions of one word is how this drifts.
//
// ── IT ONLY EVER REFUSES ────────────────────────────────────────────────────────────────────
// Nothing here grants access. Every return is either "no objection" or a reason, and a caller
// that forgets to ask simply behaves as it did before. That is what makes this safe to deploy
// ahead of the first agent: it can schedule and publish LESS than today, never more.
//
// ── WHAT 'CLEAN' MEANS ──────────────────────────────────────────────────────────────────────
// No identifiable personal identity belonging to anyone — the operator, Lisette, or a future
// agent. Recognisable footage of a person, an AI clone, and an identifiable personal voiceover
// all disqualify it.
//
// AUDIO IS NOT IDENTITY. Background music, sound effects, original ambient audio and generic
// non-identifying voiceovers are all clean. A render is not suspect because it has a soundtrack;
// it is suspect because somebody recognisable is in it. Those are different questions and this
// module never confuses them.
import { isExternalAgentConnection, type ConnectionIdentity } from "@/lib/social/agentIdentity"

/** unknown: nobody has checked. owned: it carries a specific person. clean: certified empty of
 *  anyone's identity. The ONLY value an external agent may receive is 'clean'. */
export type RenderIdentityState = "unknown" | "owned" | "clean"

export type RenderIdentity = {
  identityState: RenderIdentityState | null | undefined
  identityOwnerUserId: string | null | undefined
}

export type SourceSharing = {
  /** social_content.available_to_agents — the operator's SHARING decision, not an identity fact. */
  availableToAgents: boolean | null | undefined
}

export type Destination = ConnectionIdentity & {
  /** social_posts.connection_id. Absent means the post has no destination yet. */
  connectionId: string | null | undefined
}

export type RenderRefusal =
  /** The destination belongs to an external agent and this render is not certified clean. */
  | "identity_not_certified"
  /** The render carries a specific person's identity and this destination is not theirs. */
  | "identity_mismatch"
  /** A Personal — Only Me source may never reach another agent's account. */
  | "personal_video"

export const REFUSAL_MESSAGE: Record<RenderRefusal, string> = {
  identity_not_certified:
    "This video has not been certified free of personal identity, so it cannot be published to an agent's account.",
  identity_mismatch:
    "This video carries someone else's face or voice and cannot be published to this account.",
  personal_video:
    "This video is marked Personal — Only Me and cannot be published to an agent's account.",
}

/**
 * The destination's effective agent: whoever's audience actually sees the post.
 *
 * A connection with no agent_user_id is the OWNER's own account — that is the live TikTok row's
 * shape, and reading a missing agent as "not the owner" would refuse every post the operator
 * publishes there.
 */
export function effectiveAgent(c: ConnectionIdentity | null | undefined): string | null {
  return c?.agent_user_id ?? c?.owner_user_id ?? null
}

/**
 * Why this render may not go to this destination, or null when there is no objection.
 *
 * ── THE UNASSIGNED CASE RETURNS null, AND THAT IS NOT AN OVERSIGHT ───────────────────────────
 * A post with no connection has no destination to be authorised against, so there is no question
 * to answer. Measured before this was written: evaluating the identity rule without this guard
 * refused four real posts — three published TikToks and one draft — purely because their
 * connection_id is null and a null agent compares unequal to everything. isAgentOwnedPost already
 * takes exactly this position ("a post with no connection is unassigned admin work").
 */
export function renderRefusalFor(input: {
  render: RenderIdentity | null | undefined
  source: SourceSharing | null | undefined
  destination: Destination | null | undefined
}): RenderRefusal | null {
  const { render, source, destination } = input

  // No destination, no question.
  if (!destination?.connectionId) return null

  const external = isExternalAgentConnection(destination)
  const state = render?.identityState ?? "unknown"

  if (external) {
    // A Personal video is refused on its own terms, before anything about the render matters.
    // Reported first because it is the operator's own explicit choice and the most useful thing
    // to tell them. Read LIVE from social_content, so un-sharing a video refuses every render of
    // it on the next evaluation — no stored state can go stale behind it.
    if (source?.availableToAgents !== true) return "personal_video"

    // ── NO RECORD OF WHAT WENT IN ⇒ REFUSE ────────────────────────────────────────────────
    // A missing identity_state is not "nothing was composited", it is "nobody wrote it down".
    // recordRender is deliberately non-fatal, so a render CAN land with its bookkeeping row
    // absent; that artifact may be anything and an agent never receives it.
    // The RAW value, not `state` — that one defaults a missing record to "unknown", which is the
    // right reading for the owner's own account and exactly the wrong one here.
    if (!render || render.identityState == null) return "identity_not_certified"

    // ── OTHERWISE THE QUESTION IS WHOSE IDENTITY, NOT WHETHER ─────────────────────────────
    // Phase C required 'clean' here, which meant a certified SOURCE. The operator has chosen the
    // Personal checkbox as that signal instead — it is the judgement he already makes, on the
    // same footage, and the check above reads it live. So what remains for an agent is the
    // question this module is named for: is anybody's face or voice composited into these
    // pixels, and if so, is it theirs?
    //
    // 'owned' is set at render time from the presenter and the voice clips that actually fed
    // ffmpeg, and an artifact's contents never change, so this cannot drift as a post is edited.
    if (state === "owned") {
      const owner = render?.identityOwnerUserId ?? null
      if (!owner || owner !== effectiveAgent(destination)) return "identity_mismatch"
    }
    return null
  }

  // The owner's OWN destination. A clean or unchecked render raises nothing; one that carries a
  // specific person must be going to that person's account.
  if (state === "owned") {
    const owner = render?.identityOwnerUserId ?? null
    if (!owner || owner !== effectiveAgent(destination)) return "identity_mismatch"
  }
  return null
}

/**
 * Derive a render's identity state from what actually went into it.
 *
 * PRESENTER ⇒ OWNED, unconditionally. An AI presenter is a likeness of a specific person; there
 * is no variant of one that identifies nobody, so it is not a judgement anybody is offered.
 *
 * A VOICE CLIP is identity only until someone certifies otherwise. The system cannot hear the
 * difference between the operator reading a line and a generic or synthesised read — a person
 * can, so an uncertified clip counts as identity and a certified one does not.
 *
 * CLEAN REQUIRES THE SOURCE TOO. Every composited input being clean says nothing about whether
 * the operator is on camera in the footage underneath, which is the whole lesson of this feature.
 */
export function deriveIdentityState(input: {
  hasPresenter: boolean
  /** One entry per voice clip actually used in the render. */
  voiceClipsCertified: readonly boolean[]
  sourceCertified: boolean
  ownerUserId: string
}): { identityState: RenderIdentityState; identityOwnerUserId: string | null } {
  const uncertifiedVoice = input.voiceClipsCertified.some((certified) => !certified)
  if (input.hasPresenter || uncertifiedVoice) {
    return { identityState: "owned", identityOwnerUserId: input.ownerUserId }
  }
  if (input.sourceCertified) return { identityState: "clean", identityOwnerUserId: null }
  return { identityState: "unknown", identityOwnerUserId: null }
}
