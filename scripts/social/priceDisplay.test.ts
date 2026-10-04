/**
 * PRICE DISPLAY — compact "K" rendering + the per-source price label mode.
 *
 * Two display changes over one stored value. The stored budget_range is never
 * parsed into, rewritten, or migrated; everything here is presentation.
 *
 * THE RISK THAT NEEDED NEUTRALISING. Three templates (pov_price, what_mo_gets_you,
 * what_mo_gets_you_top) put the price in the CAPTION. isGeneratedCaption decides
 * generator-owned vs manual by comparing against freshly generated text, so a
 * caption stored as "$18,000" would have stopped matching a generator now emitting
 * "$18K" — frozen as "manual" forever, publishing the old spelling. captionKey now
 * canonicalises equivalent price spellings. The third block below is the real point
 * of this file.
 *
 * Run: npx tsx scripts/social/priceDisplay.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  startingPriceLabel, startingPriceAmount, buildCaption, isGeneratedCaption, publishCaption,
  buildTemplateDetail, buildOverlaySubheadline, priceLabelMode, PRICE_LABEL_MODES,
  COMPACT_PRICE_MIN, type SourceMeta,
} from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const eq = (l: string, got: string, want: string) => ok(l, got === want, `got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`)
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const base: SourceMeta = { market: "Dallas", propertyType: "High-Rise", special: null, socialSpecial: null, budgetRange: null, amenities: null }

async function main() {
  console.log("\nPRICE DISPLAY — COMPACT K + LABEL MODE\n")

  console.log("THE COMPACTION RULE (threshold $7,000, exact to one decimal):")
  {
    const cases: [string, string][] = [
      ["4500", "$4,500"], ["6950", "$6,950"], ["6999", "$6,999"],
      ["7000", "$7K"], ["7100", "$7.1K"], ["7500", "$7.5K"],
      ["9000", "$9K"], ["12500", "$12.5K"], ["20000", "$20K"],
      ["7250", "$7,250"], ["7123", "$7,123"], ["7050", "$7,050"],
    ]
    for (const [input, want] of cases) eq(`$${input} → ${want}`, startingPriceAmount(input), want)
    ok(`the threshold constant is ${COMPACT_PRICE_MIN}`, COMPACT_PRICE_MIN === 7000)
  }

  console.log("\nIT NEVER ROUNDS:")
  {
    // The whole reason 7250 keeps its digits: one decimal would misstate the rent.
    ok("$7,250 is NOT shown as $7.3K", !startingPriceAmount("7250").includes("7.3"))
    ok("…and NOT as $7.25K (never a second decimal)", !/\.\d\d/.test(startingPriceAmount("7250")))
    ok("$7,500 is NOT shown as $8K", startingPriceAmount("7500") !== "$8K")
    // Anything compacted must be reversible to the exact stored number.
    for (const n of [7000, 7100, 7500, 9000, 12500, 20000, 99900]) {
      const out = startingPriceAmount(String(n))
      const m = /^\$(\d+)(?:\.(\d))?K$/.exec(out)
      ok(`${out} denotes exactly ${n}`, !!m && Number(m[1]) * 1000 + Number(m[2] ?? 0) * 100 === n)
    }
  }

  console.log("\nTHE LABEL MODE:")
  {
    eq("default wording", startingPriceLabel("7500"), "Starting at $7.5K/month")
    eq("explicit starting_at", startingPriceLabel("7500", "starting_at"), "Starting at $7.5K/month")
    eq("exact_unit", startingPriceLabel("7500", "exact_unit"), "Exact unit shown: $7.5K/month")
    eq("…and below the threshold", startingPriceLabel("1495", "exact_unit"), "Exact unit shown: $1,495/month")
    eq("no price → empty in BOTH modes", startingPriceLabel(null, "exact_unit") + startingPriceLabel(null), "")
    eq("unparseable → empty", startingPriceLabel("Call for pricing", "exact_unit"), "")

    ok("null/undefined/garbage all narrow to starting_at",
      [null, undefined, "", "STARTING_AT", "nonsense", 7, {}].every((v) => priceLabelMode(v) === "starting_at"))
    ok("only the exact string selects exact_unit", priceLabelMode("exact_unit") === "exact_unit")
    ok("both modes are exported for the UI", PRICE_LABEL_MODES.length === 2)

    // The bare amount is used inside self-composed sentences, so a label there would
    // read as a double prefix. It must stay unprefixed in both modes.
    ok("startingPriceAmount carries NO label", !/Starting at|Exact unit/.test(startingPriceAmount("7500")))
  }

  console.log("\nEXISTING CONTENT IS UNCHANGED (no backfill needed):")
  {
    // A source with no stored mode must render exactly as before.
    const legacy: SourceMeta = { ...base, budgetRange: "1495" }
    eq("legacy source → Starting at, full digits", buildOverlaySubheadline(legacy), "Starting at $1,495/month")
    eq("…via the template path too", buildTemplateDetail("market_type", legacy), "Starting at $1,495/month")
    ok("the SourceMeta field is optional", !("priceLabelMode" in legacy))
  }

  console.log("\nCAPTION CLASSIFICATION SURVIVES THE FORMAT CHANGE (the point of this file):")
  {
    // what_mo_gets_you puts the price IN the caption — the exposed case.
    const meta: SourceMeta = { ...base, budgetRange: "18000", amenities: "Skyline Views" }
    const fresh = buildCaption(meta, "seed-1", "what_mo_gets_you")
    ok("the caption really does contain the compact price", fresh.includes("$18K"), fresh)

    // (1) An OLD caption, stored before compaction, written with full digits.
    const old = fresh.replace(/\$18K/g, "$18,000")
    ok("the old spelling really differs", old !== fresh)
    ok("an OLD full-price caption is STILL generator-owned",
      isGeneratedCaption(old, meta, "seed-1"))
    ok("…and republishes in the new compact format",
      publishCaption(old, meta, "seed-1", "what_mo_gets_you").includes("$18K"))

    // Same for a decimal compaction.
    const meta75: SourceMeta = { ...base, budgetRange: "7500", amenities: "Skyline Views" }
    const fresh75 = buildCaption(meta75, "seed-2", "what_mo_gets_you")
    const old75 = fresh75.replace(/\$7\.5K/g, "$7,500")
    ok("$7,500 ≡ $7.5K for classification", isGeneratedCaption(old75, meta75, "seed-2"))

    // (2) A genuinely MANUAL caption must stay manual.
    ok("a hand-written caption is NOT generator-owned",
      !isGeneratedCaption("Come see this one before it's gone — DM me!", meta, "seed-1"))
    ok("…and publishes verbatim",
      publishCaption("Come see this one before it's gone — DM me!", meta, "seed-1") === "Come see this one before it's gone — DM me!")
    // A caption that merely MENTIONS a price is still manual if the words differ.
    ok("manual text containing a price is still manual",
      !isGeneratedCaption("Units from $18,000/month, call today!", meta, "seed-1"))

    // (3) ONLY equivalent price formatting is normalised.
    ok("a DIFFERENT amount does not collapse",
      !isGeneratedCaption(fresh.replace(/\$18K/g, "$19K"), meta, "seed-1"))
    ok("…nor a different decimal", !isGeneratedCaption(fresh75.replace(/\$7\.5K/g, "$7.6K"), meta75, "seed-2"))
    ok("…nor a changed word elsewhere in the caption",
      !isGeneratedCaption(fresh.replace("Amenities", "Features"), meta, "seed-1"))
    ok("…nor a removed line", !isGeneratedCaption(fresh.split("\n").slice(0, -1).join("\n"), meta, "seed-1"))
  }

  console.log("\nONE NAME FOR ONE FIELD — upload modal and editor agree:")
  {
    const lib = read("components/crm/social/SocialAutopilotClient.tsx")
    const editor = read("components/crm/social/PostEditor.tsx")
    ok("the upload modal labels it Starting At",
      /<span className=\{fieldLabel\}>Starting At<\/span>/.test(lib))
    ok("…and the stale 'Price Range' label is gone from Social Beast",
      !/>Price Range</.test(lib) && !/>Price Range</.test(editor))
    ok("the Post Editor uses the same wording",
      /<span className=\{fieldLabel\}>Starting At<\/span>/.test(editor))
    // Label only — the input is still bound to the same batch field that writes
    // budget_range, so storage and parsing are untouched.
    ok("the upload input still writes batch.budgetRange",
      /value=\{batch\.budgetRange\}/.test(lib) && /budgetRange: meta\.budgetRange \|\| null/.test(lib))
    // No magic count: the claim is that no NEW price identifier exists and the
    // batch metadata still carries exactly one price key.
    ok("no second price identifier was introduced",
      !/startingAt|starting_at_price|priceValue|newPrice/.test(lib))
    ok("…and the upload PATCH still sends exactly one price field",
      (lib.match(/budgetRange: meta\.budgetRange/g) ?? []).length === 1)
    ok("…writing the same budget_range column as before",
      /budget_range/.test(read("app/api/admin/social-autopilot/content/route.ts")))
  }

  console.log("\nTHE STORED VALUE IS NEVER TOUCHED:")
  {
    const compose = read("lib/social/composePost.ts")
    ok("the formatter is display-only (no writes in composePost)",
      !/\.update\(|\.insert\(|supabase/.test(compose))
    ok("budget_range is never reassigned anywhere in the lib",
      !/budget_range\s*[:=]\s*(?!null)/.test(compose) || !/budget_range\s*=/.test(compose))
    const mig = read("supabase/manual/20261004_social_content_price_label_mode.sql")
    ok("the migration only ADDS a nullable column", /add column if not exists price_label_mode text;/.test(mig))
    ok("…with NO default (so no row is rewritten)", !/price_label_mode text[^;]*default/i.test(mig))
    ok("…and performs no UPDATE/backfill", !/\bupdate\b/i.test(mig.split("commit;")[0]!))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
