// READ-ONLY data-quality report for lead_next_actions (Phase 3.5).
// SELECT-only. Emits AGGREGATES ONLY — no client PII, no lead identities, no
// custom-title strings unless they are high-frequency systematic labels.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Load env from .env.local (URL + service role) without printing secrets.
const env = Object.fromEntries(
  readFileSync("/Users/jaymorris/Desktop/lonestar-locators-app/.env.local", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

// Canonical title → action_key map (known workflow labels only).
const KEY_MAP = new Map([
  ["contact lead", "contact_lead"],
  ["follow up", "follow_up"],            // contacted-stage action (NOT in the user's canonical list — flag)
  ["send list", "send_list"],
  ["build list", "build_list"],          // virtual label; a real row would be unusual
  ["fu1", "fu1"], ["fu2", "fu2"], ["fu3", "fu3"],
  ["final", "final_follow_up"],
  ["reconnect client", "reconnect_client"], // ready_to_tour far-move action (flag — not in canonical list)
  ["setup tour", "setup_tour"],
  ["tour follow-up", "tour_follow_up"],  // virtual/unimplemented
  ["email guest card", "email_guest_card"], // flag — not in canonical list
  ["check app", "check_application"],
  ["get invoice details", "get_invoice_details"], // canonical list calls this confirm_lease — flag
]);
const WORKFLOW_KEYS = new Set(KEY_MAP.values());
const norm = (t) => (t ?? "").trim().toLowerCase().replace(/\s+/g, " ");

async function fetchAll(table, cols) {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

const actions = await fetchAll("lead_next_actions", "id,lead_id,title,completed,completed_at,due_at,created_at");
const leads = await fetchAll("leads", "id,crm_status,follow_up_count,next_action_date");

// ── 1) totals ────────────────────────────────────────────────────────────────
const open = actions.filter((a) => !a.completed);
const completed = actions.filter((a) => a.completed);

// ── 2) integrity contradictions ──────────────────────────────────────────────
const completedNoTs = completed.filter((a) => !a.completed_at).length;
const openWithTs = open.filter((a) => a.completed_at).length;

// ── 3) title → key histogram ─────────────────────────────────────────────────
const keyStats = new Map(); // key -> {open, completed}
const customTitleFreq = new Map(); // normalized custom title -> {rows, leads:Set}
let unmappedRows = 0;
for (const a of actions) {
  const key = KEY_MAP.get(norm(a.title));
  if (key) {
    const s = keyStats.get(key) ?? { open: 0, completed: 0 };
    a.completed ? s.completed++ : s.open++;
    keyStats.set(key, s);
  } else {
    unmappedRows++;
    const t = norm(a.title);
    const c = customTitleFreq.get(t) ?? { rows: 0, leads: new Set() };
    c.rows++; c.leads.add(a.lead_id);
    customTitleFreq.set(t, c);
  }
}
// Only surface unmapped titles that are clearly SYSTEMATIC (>=10 distinct leads)
// as candidates to add to the canonical map. Long-tail (likely one-off custom
// tasks, possible PII) are suppressed to counts only.
const systematicUnmapped = [...customTitleFreq.entries()]
  .filter(([, c]) => c.leads.size >= 10)
  .sort((a, b) => b[1].leads.size - a[1].leads.size)
  .map(([t, c]) => ({ title: t, rows: c.rows, distinctLeads: c.leads.size }));
const suppressedCustomTitles = customTitleFreq.size - systematicUnmapped.length;

// ── 4) duplicate OPEN workflow actions per (lead, canonical key) ──────────────
const openWfGroups = new Map(); // `${lead}|${key}` -> count
for (const a of open) {
  const key = KEY_MAP.get(norm(a.title));
  if (key && WORKFLOW_KEYS.has(key)) {
    const g = `${a.lead_id}|${key}`;
    openWfGroups.set(g, (openWfGroups.get(g) ?? 0) + 1);
  }
}
let dupGroups = 0, dupExcessRows = 0;
for (const n of openWfGroups.values()) if (n > 1) { dupGroups++; dupExcessRows += n - 1; }

// ── 5) any-title duplicate open (incl. custom) for contrast ──────────────────
const openAnyGroups = new Map();
for (const a of open) { const g = `${a.lead_id}|${norm(a.title)}`; openAnyGroups.set(g, (openAnyGroups.get(g) ?? 0) + 1); }
let dupAnyGroups = 0; for (const n of openAnyGroups.values()) if (n > 1) dupAnyGroups++;

// ── 6) dual FU state (virtual vs row) for list_sent leads ────────────────────
const openFuByLead = new Map(); // lead_id -> Set of fu keys open
for (const a of open) {
  const key = KEY_MAP.get(norm(a.title));
  if (key && ["fu1", "fu2", "fu3", "final_follow_up"].includes(key)) {
    const s = openFuByLead.get(a.lead_id) ?? new Set(); s.add(key); openFuByLead.set(a.lead_id, s);
  }
}
const virtualFuFor = (fu) => (fu === 0 ? "fu1" : fu === 1 ? "fu2" : fu === 2 ? "fu3" : "final_follow_up");
let listSentLeads = 0, listSentWithOpenFuRow = 0, fuDesyncLeads = 0, leadsWithMultipleOpenFu = 0;
for (const l of leads) {
  if (l.crm_status !== "list_sent") continue;
  listSentLeads++;
  const openFu = openFuByLead.get(l.id);
  if (openFu && openFu.size) {
    listSentWithOpenFuRow++;
    if (openFu.size > 1) leadsWithMultipleOpenFu++;
    const virtual = virtualFuFor(Number(l.follow_up_count ?? 0));
    // desync = the count-derived virtual FU is NOT the open row's FU (the virtual
    // one would reappear as a second competing action)
    if (!openFu.has(virtual)) fuDesyncLeads++;
  }
}

// ── report (PII-FREE) ─────────────────────────────────────────────────────────
const report = {
  generatedFrom: url.replace(/https:\/\/([a-z0-9]+).*/, "project $1 (LB prod) — READ ONLY"),
  totals: { actions: actions.length, open: open.length, completed: completed.length, leads: leads.length },
  integrity: {
    completed_true_but_completed_at_null: completedNoTs,
    completed_false_but_completed_at_set: openWithTs,
  },
  canonicalKeyHistogram: Object.fromEntries([...keyStats.entries()].sort()),
  duplicates: {
    open_workflow_action_dupe_groups: dupGroups,          // same (lead, canonical workflow key) open >1
    open_workflow_excess_rows: dupExcessRows,             // rows to dedupe
    open_any_title_dupe_groups_incl_custom: dupAnyGroups, // contrast (custom dupes are allowed)
  },
  fuDualState: {
    list_sent_leads: listSentLeads,
    list_sent_with_open_fu_row: listSentWithOpenFuRow,
    fu_desync_leads_virtual_would_compete: fuDesyncLeads,
    leads_with_multiple_open_fu_rows: leadsWithMultipleOpenFu,
  },
  unmapped: {
    unmapped_rows: unmappedRows,
    distinct_unmapped_titles: customTitleFreq.size,
    systematic_unmapped_candidates_ge10_leads: systematicUnmapped,  // titles only if systematic
    suppressed_longtail_custom_titles: suppressedCustomTitles,       // count only (possible PII)
  },
};
console.log(JSON.stringify(report, null, 2));
