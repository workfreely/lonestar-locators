// Shared runner for research batches. Every batch imports this, so every batch goes through
// saveResearch() — and therefore through mergeStableResearch — by construction.
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import { saveResearch, type ResearchRecord } from "./saveResearch"

const env: Record<string, string> = {}
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
export const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
export const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
export const V = "2026-10-15"
export const geo = (market: string, city: string, broaderArea: string, district: string | null, note?: string) =>
  ({ market, city, broaderArea, district, ...(note ? { note } : {}), verifiedAt: V })

export async function run(rows: ResearchRecord[]) {
  let ins = 0, mer = 0, unc = 0
  for (const r of rows) {
    try {
      const res = await saveResearch(sb, r)
      if (res.action === "inserted") ins++; else if (res.action === "merged") mer++; else unc++
      const extra = res.preserved.length ? `  [preserved ${res.preserved.length}: ${res.preserved.slice(0,4).join(", ")}]` : ""
      console.log(`  ${res.action.padEnd(9)} ${res.property}${extra}`)
      for (const w of res.warnings) console.log(`      ! ${w}`)
    } catch (e) { console.log(`  FAILED    ${r.property_name}: ${(e as Error).message}`) }
  }
  console.log(`\ninserted ${ins} | merged ${mer} | unchanged ${unc}`)
}
