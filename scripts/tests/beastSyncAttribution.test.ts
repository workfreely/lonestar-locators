/**
 * BEAST SYNC ATTRIBUTION — the nine proofs required for the phone-identity
 * checkpoint, plus the rules that keep attribution from guessing.
 *
 * The real `attributeUnattributedMessages` is exercised against an in-memory
 * stand-in for the Supabase query builder, NOT mocked out. That matters: the
 * workspace boundary, the soft-delete filter and the "never move an attributed
 * message" guard live in the QUERY, so a test that only called the pure decision
 * function would assert nothing about them. The stub applies the same filters a
 * real PostgREST query would, so leaving one off makes a test fail.
 *
 * Run: npx tsx scripts/tests/beastSyncAttribution.test.ts
 */
import {
  decideAttribution,
  attributeUnattributedMessages,
  reattributeForLeadPhone,
  type CandidateLead,
  type UnattributedMessage,
} from "../../lib/companion/attribution"
import { withPhoneIdentity, toE164 } from "../../lib/phone/identity"
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A minimal stand-in for the PostgREST query builder: enough of .select/.eq/.is/
// .in/.update to run the real function. Filters are APPLIED, not recorded, so an
// omitted workspace or deleted_at filter changes the result and breaks a test.
// ─────────────────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>
type Filter = { kind: "eq" | "is" | "in"; col: string; val: unknown }

function makeDb(tables: Record<string, Row[]>) {
  const updates: Array<{ table: string; patch: Row; matched: number }> = []

  const matches = (row: Row, filters: Filter[]) =>
    filters.every((f) => {
      if (f.kind === "in") return (f.val as unknown[]).includes(row[f.col])
      // PostgREST `.is(col, null)` and `.eq` both compare directly here; an
      // undefined column (a migration not yet applied) is treated as null, which
      // is exactly how the real column behaves before a backfill.
      const actual = row[f.col] ?? null
      return actual === (f.val ?? null)
    })

  function builder(table: string, mode: "select" | "update", patch?: Row) {
    const filters: Filter[] = []
    const api: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push({ kind: "eq", col, val })
        return api
      },
      is(col: string, val: unknown) {
        filters.push({ kind: "is", col, val })
        return api
      },
      in(col: string, val: unknown[]) {
        filters.push({ kind: "in", col, val })
        return api
      },
      then(resolve: (r: { data: Row[] | null; error: null }) => void) {
        const hits = (tables[table] ?? []).filter((r) => matches(r, filters))
        if (mode === "update" && patch) {
          for (const r of hits) Object.assign(r, patch)
          updates.push({ table, patch, matched: hits.length })
        }
        resolve({ data: hits, error: null })
      },
    }
    return api
  }

  return {
    db: {
      from(table: string) {
        return {
          select: () => builder(table, "select"),
          update: (patch: Row) => builder(table, "update", patch),
        }
      },
    } as never,
    updates,
  }
}

const WS_A = "aaaaaaaa-0000-0000-0000-000000000001"
const WS_B = "bbbbbbbb-0000-0000-0000-000000000002"

async function main() {
  console.log("\nBEAST SYNC ATTRIBUTION\n")

  // ─── Requirements 1–3: every write path derives the identity ────────────────
  console.log("Requirements 1-3 — Smart Lead Form / Add Lead / Edit Client store an identity")
  check(
    "a submitted U.S. phone gets a canonical identity",
    withPhoneIdentity({ first_name: "Dana", phone: "(210) 555-1234" }).phone_e164 === "+12105551234",
  )
  check(
    "the masked form value and a bare one produce the SAME identity",
    withPhoneIdentity({ phone: "(210) 555-1234" }).phone_e164 ===
      withPhoneIdentity({ phone: "2105551234" }).phone_e164,
  )
  check(
    "a patch that does not touch phone does not touch the identity",
    !("phone_e164" in withPhoneIdentity({ move_date: "2026-11-01", notes: "x" })),
  )
  check(
    "clearing the phone clears the identity (it must not go stale)",
    withPhoneIdentity({ phone: "" }).phone_e164 === null,
  )
  check(
    "a non-U.S. phone is stored but gets NO identity",
    (() => {
      const p = withPhoneIdentity({ phone: "+44 20 7946 0958" })
      return p.phone === "+44 20 7946 0958" && p.phone_e164 === null
    })(),
  )

  // All three write paths must actually call it. Structural, because the alternative
  // is a write path that silently stores a lead Beast Sync can never attribute.
  const submitSrc = readFileSync("app/api/leads/submit/route.ts", "utf8")
  const modalSrc = readFileSync("components/LeadFormModal.tsx", "utf8")
  check(
    "the submit route derives the identity on INSERT (Smart Lead Form + Add Lead + bridge)",
    /\.insert\(\[withPhoneIdentity\(/.test(submitSrc),
  )
  check(
    "the submit route derives the identity on the exact-duplicate UPDATE",
    /\.update\(withPhoneIdentity\(/.test(submitSrc),
  )
  check("Edit Client derives the identity in the same patch as the phone", /withPhoneIdentity\(buildEditPatch\(/.test(modalSrc))
  check("Edit Client then asks for late attribution", /companion\/reattribute/.test(modalSrc))

  // ─── Requirement 4: a number added AFTER the messages arrived ───────────────
  console.log("\nRequirement 4 — a phone added after lead creation picks up waiting messages")
  {
    const leads: Row[] = [{ id: 1, workspace_id: WS_A, phone: "(210) 555-1234", phone_e164: "+12105551234", deleted_at: null }]
    const messages: Row[] = [
      { id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null, attribution_status: null },
      { id: "m2", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null, attribution_status: null },
    ]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await reattributeForLeadPhone(db, WS_A, "2105551234")
    check("both waiting messages attach to the lead", r?.attributed === 2, JSON.stringify(r))
    check("…and the rows actually carry the lead id", messages.every((m) => m.lead_id === 1))
    check("…and are marked attributed", messages.every((m) => m.attribution_status === "attributed"))
  }
  {
    // The lead existed with NO phone the whole time the messages were arriving.
    const leads: Row[] = [{ id: 7, workspace_id: WS_A, phone: null, phone_e164: null, deleted_at: null }]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const before = await attributeUnattributedMessages(db, WS_A)
    check("while the lead has no phone, nothing is attributed", before.attributed === 0 && before.no_match === 1)

    // …now the locator adds it through Edit Client.
    Object.assign(leads[0], withPhoneIdentity({ phone: "210-555-1234" }))
    const after = await reattributeForLeadPhone(db, WS_A, "210-555-1234")
    check("after the number is added, the waiting message attaches", after?.attributed === 1)
    check("…to the right lead", messages[0].lead_id === 7)
  }

  // ─── Requirement 7: workspaces never cross ─────────────────────────────────
  console.log("\nRequirement 7 — the same number in another workspace cannot cross-attribute")
  {
    const leads: Row[] = [
      { id: 1, workspace_id: WS_A, phone_e164: "+12105551234", deleted_at: null },
      { id: 2, workspace_id: WS_B, phone_e164: "+12105551234", deleted_at: null },
    ]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("the message attributes within its own workspace", r.attributed === 1)
    check("…to workspace A's lead, not workspace B's", messages[0].lead_id === 1)
    check("…and the shared number is NOT treated as a conflict (different businesses)", r.ambiguous === 0)
  }
  {
    // Only the OTHER workspace has the number — so there is no match at all.
    const leads: Row[] = [{ id: 2, workspace_id: WS_B, phone_e164: "+12105551234", deleted_at: null }]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("a lead in another workspace is never reachable", r.attributed === 0 && r.no_match === 1)
    check("…and the message stays unattributed", messages[0].lead_id === null)
  }

  // ─── Requirement 8: duplicates produce a conflict, never a guess ───────────
  console.log("\nRequirement 8 — a duplicate number in one workspace is a conflict, not a coin flip")
  {
    const leads: Row[] = [
      { id: 11, workspace_id: WS_A, phone_e164: "+12105550199", deleted_at: null },
      { id: 12, workspace_id: WS_A, phone_e164: "+12105550199", deleted_at: null },
    ]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105550199", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("nothing is attributed", r.attributed === 0)
    check("it is reported as ambiguous", r.ambiguous === 1)
    check("the message is left unattributed", messages[0].lead_id === null)
    check("…and marked 'ambiguous' so it can be surfaced", messages[0].attribution_status === "ambiguous")
    check("the conflict names BOTH leads", JSON.stringify(r.conflicts) === JSON.stringify([{ phoneE164: "+12105550199", leadIds: [11, 12] }]))
  }
  {
    // Production's actual shape: two leads share a number but one is soft-deleted,
    // so there is exactly one live candidate and no real ambiguity.
    const leads: Row[] = [
      { id: 59, workspace_id: WS_A, phone_e164: "+12105550199", deleted_at: "2026-09-01T00:00:00Z" },
      { id: 78, workspace_id: WS_A, phone_e164: "+12105550199", deleted_at: null },
    ]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105550199", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("a soft-deleted duplicate does not create ambiguity", r.ambiguous === 0 && r.attributed === 1)
    check("…and the LIVE lead gets the message", messages[0].lead_id === 78)
  }
  {
    const leads: Row[] = [{ id: 59, workspace_id: WS_A, phone_e164: "+12105550199", deleted_at: "2026-09-01T00:00:00Z" }]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105550199", lead_id: null }]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("a soft-deleted lead can never capture a message on its own", r.attributed === 0 && r.no_match === 1)
  }

  // ─── Requirement 9: idempotency, and never moving history ──────────────────
  console.log("\nRequirement 9 — Refresh Now stays idempotent and never relocates history")
  {
    const leads: Row[] = [{ id: 1, workspace_id: WS_A, phone_e164: "+12105551234", deleted_at: null }]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null }]
    const { db, updates } = makeDb({ leads, companion_messages: messages })
    const first = await attributeUnattributedMessages(db, WS_A)
    const writesAfterFirst = updates.length
    const second = await attributeUnattributedMessages(db, WS_A)
    const third = await attributeUnattributedMessages(db, WS_A)
    check("the first run attributes", first.attributed === 1)
    check("the second run does nothing", second.attributed === 0 && second.no_match === 0)
    check("the third run does nothing", third.attributed === 0)
    check("…and performs no further writes", updates.length === writesAfterFirst)
    check("the message keeps its original lead", messages[0].lead_id === 1)
  }
  {
    // The dangerous case: the lead's number changes and ANOTHER lead now holds the
    // old one. A re-sync must not drag the conversation across.
    const leads: Row[] = [
      { id: 1, workspace_id: WS_A, phone_e164: "+19995550000", deleted_at: null }, // moved on
      { id: 2, workspace_id: WS_A, phone_e164: "+12105551234", deleted_at: null }, // holds the old number
    ]
    const messages: Row[] = [
      { id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: 1, attribution_status: "attributed" },
    ]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("an already-attributed message is not even considered", r.attributed === 0)
    check("…and is NOT moved to the lead that now holds that number", messages[0].lead_id === 1)
  }
  {
    // Ingest must not clobber an existing attribution. The route omits lead_id from
    // its upsert payload precisely so PostgREST leaves it alone on conflict.
    const ingestSrc = readFileSync("app/api/companion/messages/route.ts", "utf8")
    const upsertBlock = ingestSrc.slice(ingestSrc.indexOf("const rows = clean.map"), ingestSrc.indexOf(".upsert(rows"))
    check("the ingest upsert payload does NOT include lead_id", !/\blead_id\s*:/.test(upsertBlock))
    check("the ingest upsert still keys on (workspace, guid) for idempotency", /onConflict:\s*"workspace_id,guid"/.test(ingestSrc))
    check("ingest derives the canonical identity", /phone_e164:\s*toE164\(/.test(ingestSrc))
    check("the old last-10 rule is gone from ingest", !/slice\(-10\)/.test(ingestSrc))
  }

  // ─── The query-level guards these rules depend on ──────────────────────────
  console.log("\nThe guards are in the queries, not just the decision")
  {
    const attrSrc = readFileSync("lib/companion/attribution.ts", "utf8")
    check("leads are workspace-scoped", /\.eq\("workspace_id", workspaceId\)/.test(attrSrc))
    check("soft-deleted leads are excluded", /\.is\("deleted_at", null\)/.test(attrSrc))
    check("only unattributed messages are read", /\.is\("lead_id", null\)/.test(attrSrc))
    check(
      "the write re-asserts lead_id IS NULL (concurrency guard)",
      attrSrc.slice(attrSrc.indexOf(".update({ lead_id")).includes('.is("lead_id", null)'),
    )
  }

  // ─── Decision-level edge cases ─────────────────────────────────────────────
  console.log("\nDecision-level edge cases")
  {
    const msgs: UnattributedMessage[] = [
      { id: "eligible", phone_e164: "+12105551234" },
      { id: "email-handle", phone_e164: null },
    ]
    const leads: CandidateLead[] = [{ id: 1, phone_e164: "+12105551234" }]
    const d = decideAttribution(msgs, leads)
    check("an e-mail iMessage handle is 'ineligible', not 'no_match'", d[1].status === "ineligible")
    check("…and gets no lead", d[1].leadId === null)
    check("the eligible one is unaffected by it", d[0].status === "attributed" && d[0].leadId === 1)
  }
  check(
    "a lead with a null identity never matches a null-identity message",
    decideAttribution([{ id: "m", phone_e164: null }], [{ id: 1, phone_e164: null }])[0].leadId === null,
  )
  check("no messages → no decisions", decideAttribution([], [{ id: 1, phone_e164: "+12105551234" }]).length === 0)
  check(
    "no leads → every message is no_match",
    decideAttribution([{ id: "m", phone_e164: "+12105551234" }], []).every((d) => d.status === "no_match"),
  )
  check(
    "conflicting lead ids are reported in a stable order",
    JSON.stringify(
      decideAttribution(
        [{ id: "m", phone_e164: "+1210555" + "0199" }],
        [
          { id: 99, phone_e164: "+12105550199" },
          { id: 11, phone_e164: "+12105550199" },
        ],
      )[0].conflictingLeadIds,
    ) === "[11,99]",
  )
  {
    // A narrowed call must never silently widen into a full workspace sweep.
    const leads: Row[] = [{ id: 1, workspace_id: WS_A, phone_e164: "+12105551234", deleted_at: null }]
    const messages: Row[] = [{ id: "m1", workspace_id: WS_A, phone_e164: "+12105551234", lead_id: null }]
    const { db, updates } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A, { identities: [] })
    check("an empty identity list is a no-op, not a full sweep", r.attributed === 0 && updates.length === 0)
    check("…and leaves the message alone", messages[0].lead_id === null)
  }
  check(
    "a late-attribution call with an ineligible number does nothing",
    (await reattributeForLeadPhone(makeDb({ leads: [], companion_messages: [] }).db, WS_A, "+442079460958")) === null,
  )
  check("…and the same for a blank number", (await reattributeForLeadPhone(makeDb({ leads: [], companion_messages: [] }).db, WS_A, "")) === null)

  // ─── Requirement 6, end to end through attribution ─────────────────────────
  console.log("\nRequirement 6 end-to-end — a foreign number cannot reach a look-alike lead")
  {
    // The Maine lead and the London message share their last ten digits. Under the
    // old rule this attributed; it must not now.
    const leads: Row[] = [{ id: 1, workspace_id: WS_A, ...withPhoneIdentity({ phone: "(207) 946-0958" }), deleted_at: null }]
    const messages: Row[] = [
      { id: "uk", workspace_id: WS_A, phone: "+44 20 7946 0958", phone_e164: toE164("+44 20 7946 0958"), lead_id: null },
    ]
    const { db } = makeDb({ leads, companion_messages: messages })
    const r = await attributeUnattributedMessages(db, WS_A)
    check("the Maine lead DID get an identity", (leads[0] as Row).phone_e164 === "+12079460958")
    check("the London message got NO identity", messages[0].phone_e164 === null)
    check("nothing is attributed", r.attributed === 0)
    check("the message is marked ineligible", messages[0].attribution_status === "ineligible")
    check("the Maine lead's timeline is untouched", messages[0].lead_id === null)
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
