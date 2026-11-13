// LEAD OWNERSHIP AND AGENT ISOLATION — whose form a comment reply links to.
// Run: npx tsx scripts/social/leadOwnership.test.ts
//
// The property under test is a data-ownership one, not a formatting one: a reply sent from an
// AGENT's Instagram must send that person to the AGENT's lead form, so the lead lands in the
// AGENT's CRM. Resolving the slug from the connection's OWNER sent every agent's leads to the
// platform admin, because an invited destination is owned by the admin who minted the invitation
// and only the agent_user_id names whose account it actually is.
//
// Driven through a fake Supabase client rather than a live database: the behaviour being asserted
// is which id the resolver reads, and a fake makes a wrong id a failed assertion instead of a row
// nobody notices.
import { readFileSync } from "node:fs"
import path from "node:path"
import { createCommentStore } from "@/lib/social/commentStore"
import { leadFormLink } from "@/lib/social/commentKeywords"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const ADMIN = "c567c077-0000-0000-0000-000000000001"   // the platform admin / connection owner
const LISETTE = "11111111-0000-0000-0000-000000000002" // an agent
const JAY = "22222222-0000-0000-0000-000000000003"     // another agent

const WORKSPACES: Record<string, { id: string; slug: string }> = {
  [ADMIN]: { id: "ws-admin", slug: "locatorbeast" },
  [LISETTE]: { id: "ws-lisette", slug: "locatorlisette" },
  [JAY]: { id: "ws-jay", slug: "realestatepro" },
}

type Conn = {
  id: string; owner_user_id: string; agent_user_id: string | null
  external_account_id: string; username: string; scopes: string[]; status: string
}

/** The smallest fake that answers the four reads findConnection makes. */
function fakeDb(conns: Conn[]) {
  const q = (table: string) => {
    const state: Record<string, string> = {}
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (col: string, val: string) => { state[col] = val; return api },
      limit: () => api,
      maybeSingle: async () => {
        if (table === "social_connections") {
          const hit = conns.find((c) => c.external_account_id === state.external_account_id)
          return { data: hit ?? null, error: null }
        }
        if (table === "workspace_members") {
          const ws = WORKSPACES[state.user_id]
          return { data: ws ? { workspace_id: ws.id } : null, error: null }
        }
        if (table === "workspaces") {
          const ws = Object.values(WORKSPACES).find((w) => w.id === state.id)
          return { data: ws ? { slug: ws.slug } : null, error: null }
        }
        return { data: null, error: null }
      },
    }
    return api
  }
  return {
    from: (t: string) => q(t),
    // The token read is a security-definer RPC; a usable token keeps findConnection on the path
    // under test instead of short-circuiting before the slug is resolved.
    rpc: async () => ({ data: [{ token: "tok" }], error: null }),
  } as never
}

const base = { scopes: ["instagram_business_manage_comments"], status: "connected" }
const LISETTE_CONN: Conn = { id: "c-l", owner_user_id: ADMIN, agent_user_id: LISETTE, external_account_id: "ig-lisette", username: "locatorlisette", ...base }
const JAY_CONN: Conn = { id: "c-j", owner_user_id: ADMIN, agent_user_id: JAY, external_account_id: "ig-jay", username: "realestatepro_tx", ...base }
const ORPHAN_CONN: Conn = { id: "c-o", owner_user_id: ADMIN, agent_user_id: null, external_account_id: "ig-orphan", username: "unassigned", ...base }

const store = createCommentStore(fakeDb([LISETTE_CONN, JAY_CONN, ORPHAN_CONN]))

async function main() {
  console.log("each agent's replies link to THAT agent's form:")
  const lisette = await store.findConnection("instagram", "ig-lisette")
  const jay = await store.findConnection("instagram", "ig-jay")
  ok("Lisette's connection resolves", !!lisette)
  ok("…to LISETTE's slug, not the owner's", lisette?.formUsername === "locatorlisette")
  ok("…and specifically NOT the platform admin's", lisette?.formUsername !== "locatorbeast")
  ok("Jay's connection resolves to Jay's slug", jay?.formUsername === "realestatepro")

  console.log("\nthe two agents are isolated from each other:")
  ok("different slugs", lisette?.formUsername !== jay?.formUsername)
  ok("different connection ids", lisette?.connectionId !== jay?.connectionId)
  const lisetteLink = leadFormLink({ origin: "https://locatorbeast.com", username: lisette!.formUsername, platformSlug: "ig", keyword: "info" })
  const jayLink = leadFormLink({ origin: "https://locatorbeast.com", username: jay!.formUsername, platformSlug: "ig", keyword: "info" })
  ok("Lisette's link points at /locatorlisette/", lisetteLink.includes("/locatorlisette/"))
  ok("…and contains no trace of Jay's or the admin's form",
    !lisetteLink.includes("realestatepro") && !lisetteLink.includes("locatorbeast/"))
  ok("Jay's link points at /realestatepro/ and not at Lisette's",
    jayLink.includes("/realestatepro/") && !jayLink.includes("locatorlisette"))

  console.log("\nAN UNASSIGNED CONNECTION ROUTES NOWHERE — never to the platform administrator:")
  const orphan = await store.findConnection("instagram", "ig-orphan")
  ok("no agent means no connection context at all", orphan === null)
  ok("…so no link can be built from it, let alone the admin's", orphan === null)

  console.log("\nthe resolver reads the AGENT id, asserted on the source:")
  const src = read("lib/social/commentStore.ts").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
  ok("the slug is resolved through the agent-aware helper", /leadFormSlugForConnection\(db, row\)/.test(src))
  ok("…which reads agent_user_id", /agentId = \(conn\.agent_user_id/.test(src))
  ok("…and returns null rather than falling back to the owner",
    /if \(!agentId\) return null/.test(src) && !/workspaceSlug\(db, (row\.)?owner_user_id\)/.test(src))
  ok("agent_user_id is actually selected, or the resolver reads undefined",
    /select\("id, owner_user_id, agent_user_id, external_account_id/.test(src))

  console.log(`\nLead ownership: ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
