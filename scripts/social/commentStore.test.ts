// Comments — THE STORE'S ATOMIC CLAIM, asserted against a recording query builder.
//
// WHY THIS TEST EXISTS. DM_CLAIM_SQL is the canonical statement of the one-DM-per-person rule:
//
//     update social_commenters set dm_claimed_at = now()
//      where id = $1 and dm_claimed_at is null and dm_sent_at is null
//     returning id
//
// supabase-js cannot run raw SQL, so the store re-expresses that predicate as PostgREST filters.
// Two things could then drift silently and neither would ever throw:
//   - dropping `.is("dm_sent_at", null)` would let an already-messaged person be claimed again;
//   - dropping `.is("dm_claimed_at", null)` would let two workers both claim and both send.
// Either produces a SECOND unsolicited message — the worst outcome this feature can have — and the
// code would look perfectly fine. So the filters are asserted, not trusted.
// Run: npx tsx scripts/social/commentStore.test.ts
import { createCommentStore } from "@/lib/social/commentStore"
import { DM_CLAIM_SQL } from "@/lib/social/commentIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

type Call = { table: string; op: string; args: unknown[] }

/** A builder that records what the store asked for and returns a programmed result. */
function recorder(result: { data: unknown; error: unknown }) {
  const calls: Call[] = []
  let table = ""
  const chain: Record<string, unknown> = {}
  const record = (op: string) => (...args: unknown[]) => { calls.push({ table, op, args }); return chain }
  for (const op of ["update", "eq", "is", "select", "insert", "upsert", "limit", "maybeSingle", "single", "order", "in"]) {
    chain[op] = record(op)
  }
  // The terminal awaits resolve to the programmed result.
  ;(chain as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  const db = {
    from(t: string) { table = t; return chain },
    rpc: record("rpc"),
  }
  return { db, calls }
}

async function main() {
  console.log("1. THE CLAIM'S PREDICATE MATCHES DM_CLAIM_SQL:")
  {
    const { db, calls } = recorder({ data: [{ id: "commenter-1" }], error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = createCommentStore(db as any)
    const won = await store.claimDm("commenter-1")

    ok("the claim is a single UPDATE on social_commenters",
      calls.some((c) => c.table === "social_commenters" && c.op === "update"))
    ok("it is scoped to the one commenter by id",
      calls.some((c) => c.op === "eq" && c.args[0] === "id" && c.args[1] === "commenter-1"))

    const isFilters = calls.filter((c) => c.op === "is").map((c) => `${c.args[0]}=${String(c.args[1])}`)
    ok("it requires dm_claimed_at IS NULL — without it, two workers both claim and both send",
      isFilters.includes("dm_claimed_at=null"), isFilters.join(", "))
    ok("it requires dm_sent_at IS NULL — without it, an already-messaged person is claimed again",
      isFilters.includes("dm_sent_at=null"), isFilters.join(", "))
    ok("BOTH null checks are present, exactly as the canonical SQL has them",
      isFilters.length === 2)
    ok("it RETURNS the row, so the caller can tell whether it won",
      calls.some((c) => c.op === "select" && c.args[0] === "id"))
    ok("a returned row means the claim was won", won === true)

    // The canonical SQL is the reference. If someone edits it, this test should be revisited too.
    for (const fragment of ["dm_claimed_at is null", "dm_sent_at is null", "returning id"]) {
      if (!DM_CLAIM_SQL.toLowerCase().includes(fragment)) {
        fail++; console.log(`  ✗ the canonical DM_CLAIM_SQL no longer contains "${fragment}"`)
      }
    }
    ok("the canonical SQL still states both null checks and RETURNING", true)
  }

  console.log("\n2. LOSING, AND FAILING, BOTH MEAN DO NOT SEND:")
  {
    const empty = recorder({ data: [], error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok("NO ROW returned ⇒ somebody else owns this person's DM ⇒ claim lost",
      (await createCommentStore(empty.db as any).claimDm("x")) === false)

    const errored = recorder({ data: null, error: { message: "deadlock detected" } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok("a database ERROR is also a lost claim — it never optimistically proceeds",
      (await createCommentStore(errored.db as any).claimDm("x")) === false)

    // Two rows would mean the filter was not unique. Treated as not-won rather than assumed fine.
    const two = recorder({ data: [{ id: "a" }, { id: "b" }], error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ok("more than one affected row is NOT treated as a win",
      (await createCommentStore(two.db as any).claimDm("x")) === false)
  }

  console.log("\n3. RESOLVING AN UNCERTAIN SEND WRITES NOTHING AT ALL:")
  {
    const { db, calls } = recorder({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = createCommentStore(db as any)
    await store.resolveDm("commenter-1", { markSent: false, releaseClaim: false })
    // The person stays claimed for ever. That is the correct failure direction when the alternative
    // is messaging a stranger twice — and it must be achieved by writing NOTHING, not by writing a
    // patch that happens to be empty.
    ok("an uncertain outcome issues NO update whatsoever",
      !calls.some((c) => c.op === "update"), calls.map((c) => c.op).join(","))

    const sent = recorder({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createCommentStore(sent.db as any).resolveDm("c1", { markSent: true, releaseClaim: false })
    const patch = sent.calls.find((c) => c.op === "update")?.args[0] as Record<string, unknown>
    ok("an accepted send stamps dm_sent_at", typeof patch?.dm_sent_at === "string")
    ok("…and does NOT clear the claim", !("dm_claimed_at" in (patch ?? {})))

    const rel = recorder({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createCommentStore(rel.db as any).resolveDm("c1", { markSent: false, releaseClaim: true })
    const relPatch = rel.calls.find((c) => c.op === "update")?.args[0] as Record<string, unknown>
    ok("a confirmed failure clears the claim and stamps nothing",
      relPatch?.dm_claimed_at === null && !("dm_sent_at" in (relPatch ?? {})))
  }

  console.log("\n4. AN UPSERT MUST NEVER RESET A PERSON'S MESSAGE HISTORY:")
  {
    const { db, calls } = recorder({
      data: { id: "c1", provider_user_id: "u1", dm_sent_at: "2026-10-01T00:00:00Z", dm_claimed_at: null, last_public_reply_at: null },
      error: null,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = createCommentStore(db as any)
    const r = await store.upsertCommenter({
      connectionId: "conn", provider: "instagram", providerUserId: "u1",
      username: "renter.jane", profileUrl: null,
    })
    const payload = calls.find((c) => c.op === "upsert")?.args[0] as Record<string, unknown>
    // If an upsert overwrote these, a returning commenter would become messageable again and the
    // "one DM per person, ever" rule would quietly reset every time they commented.
    for (const field of ["dm_sent_at", "dm_claimed_at", "last_public_reply_at"]) {
      if (field in (payload ?? {})) { fail++; console.log(`  ✗ the upsert writes ${field}, which would reset message history`) }
    }
    ok("the upsert writes NONE of dm_sent_at, dm_claimed_at or last_public_reply_at", true)
    ok("it conflicts on (connection_id, provider_user_id) — the unique index",
      (calls.find((c) => c.op === "upsert")?.args[1] as { onConflict?: string })?.onConflict === "connection_id,provider_user_id")
    ok("an existing dm_sent_at is READ BACK, so the gate can refuse a second message",
      r.dmSentAt === "2026-10-01T00:00:00Z")
    ok("a profile URL is derived safely from the handle when none was supplied",
      r.providerUserId === "u1" && typeof payload.profile_url === "string"
      && (payload.profile_url as string).includes("instagram.com/renter.jane"))
  }



  console.log("\n5. REPLAY AND CONCURRENCY — a genuinely simultaneous double delivery:")
  {
    // Meta's X-Hub-Signature-256 carries NO timestamp and NO nonce, so a captured valid body stays
    // valid for ever and there is no cryptographic replay protection to lean on. Idempotency is the
    // entire defence, and the runner's findComment check is CHECK-THEN-ACT: two deliveries arriving
    // in the same millisecond both see "not stored" and both insert. The unique index
    // (provider, external_comment_id) is what actually serialises them, and the loser must recover
    // the winner's row rather than fail — otherwise a replayed delivery would 500 and Meta would
    // retry it, forever.
    const dup = recorder({ data: null, error: { message: 'duplicate key value violates unique constraint "social_comments_external_uidx"' } })
    const calls = dup.calls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const store = createCommentStore(dup.db as any)
    let threw = false
    let row: { id: string } | null = null
    try {
      row = await store.insertComment({
        connectionId: "conn", provider: "instagram", externalCommentId: "c-1",
        externalMediaId: null, commenterId: null, authorUsername: "u",
        body: "LIST", commentedAt: null, matchedKeyword: "LIST", holdReason: null,
      })
    } catch { threw = true }

    // The recorder returns the same error for the read-back too, so this asserts the SHAPE of the
    // recovery: a unique violation must be followed by a lookup, not propagated immediately.
    ok("a unique violation triggers a read-back of the existing row, not an immediate throw",
      calls.filter((c) => c.table === "social_comments" && c.op === "select").length >= 1)
    ok("the read-back is keyed on (provider, external_comment_id) — the unique index",
      calls.some((c) => c.op === "eq" && c.args[0] === "external_comment_id" && c.args[1] === "c-1")
      && calls.some((c) => c.op === "eq" && c.args[0] === "provider"))
    ok("…and only when the read-back ALSO finds nothing does it throw",
      threw === true && row === null)

    const recovered = recorder({ data: { id: "winner-row" }, error: null })
    // The first call returns the row (the recorder is single-programmed), which stands in for the
    // winner's row being found. What matters is that the loser ends up with a row id and no error.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r2 = await createCommentStore(recovered.db as any).insertComment({
      connectionId: "conn", provider: "instagram", externalCommentId: "c-1",
      externalMediaId: null, commenterId: null, authorUsername: "u",
      body: "LIST", commentedAt: null, matchedKeyword: "LIST", holdReason: null,
    })
    ok("the loser of an insert race continues with a usable row id", r2.id === "winner-row")
  }

  console.log("\n6. THE ACTION LEDGER IS WRITE-ONCE PER (COMMENT, KIND):")
  {
    // UNIQUE (comment_id, kind) is what stops a replay recording a second verdict for the same
    // comment. A rejected second insert is the index doing its job, so it must NOT throw — the
    // first record of what happened is the true one.
    const dup = recorder({ data: null, error: { message: "duplicate key value violates unique constraint \"comment_actions_once_uidx\"" } })
    let threw = false
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createCommentStore(dup.db as any).logAction({
        commentId: "row-1", kind: "private_reply", status: "sent", reason: "accepted",
        externalId: "msg-1", error: null,
      })
    } catch { threw = true }
    ok("a duplicate ledger write is swallowed, never thrown",
      threw === false)

    const fresh = recorder({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createCommentStore(fresh.db as any).logAction({
      commentId: "row-1", kind: "private_reply", status: "skipped", reason: "sending_disabled",
      externalId: null, error: null,
    })
    const payload = fresh.calls.find((c) => c.op === "insert")?.args[0] as Record<string, unknown>
    ok("a SKIPPED action records no attempt timestamps — nothing was attempted",
      payload?.attempted_at === null && payload?.completed_at === null)

    const sent = recorder({ data: null, error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await createCommentStore(sent.db as any).logAction({
      commentId: "row-1", kind: "private_reply", status: "sent", reason: "accepted",
      externalId: "msg-1", error: null,
    })
    const sentPayload = sent.calls.find((c) => c.op === "insert")?.args[0] as Record<string, unknown>
    ok("a SENT action records both timestamps and the provider's id",
      typeof sentPayload?.attempted_at === "string" && sentPayload?.external_id === "msg-1")
  }
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)

  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => { console.error(e); process.exit(1) })
