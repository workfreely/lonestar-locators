/**
 * OVERLAY TEMPLATE PERSISTENCE — the PATCH route must accept every canonical template.
 *
 * THE BUG THIS LOCKS OUT. posts/[id]/route.ts validated overlayTemplate against a
 * hard-coded Set of five keys that was never updated as templates were added. The
 * editor offered 16; 11 of them — "market_type_centered" (2) and everything from
 * "apartment_standards" (7) on — were silently dropped. The PATCH returned 200 and
 * saved the headline, so the editor looked like it had worked until reload.
 *
 * Silent is the operative word: there was no error to notice. The only thing that
 * would have caught it is a test that walks the canonical list, which is what this
 * file is. It iterates OVERLAY_TEMPLATES rather than naming templates, so adding a
 * 17th and forgetting the API cannot pass.
 *
 * Run: npx tsx scripts/social/overlayTemplatePersist.test.ts
 */
import { readFileSync } from "node:fs"
import { RENDER_AFFECTING_COLUMNS, shouldInvalidateRender } from "@/lib/social/renderInvalidation"
import path from "node:path"
import { OVERLAY_TEMPLATES, DEFAULT_OVERLAY_TEMPLATE, isOverlayTemplate } from "@/lib/social/composePost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

const ROUTE = "app/api/admin/social-autopilot/posts/[id]/route.ts"

async function main() {
  console.log("\nOVERLAY TEMPLATE PERSISTENCE\n")

  const route = strip(read(ROUTE))
  const editor = strip(read("components/crm/social/PostEditor.tsx"))
  const library = strip(read("components/crm/social/SocialAutopilotClient.tsx"))

  console.log("THE API VALIDATES AGAINST THE CANONICAL LIST:")
  {
    ok("the PATCH gate calls isOverlayTemplate",
      /if \("overlayTemplate" in body && isOverlayTemplate\(body\.overlayTemplate\)\)/.test(route))
    // Brace-agnostic: the guard's body lost its braces when the presence-based renderAffecting
    // flag was removed, and the old regex required them verbatim.
    ok("…and assigns the value when it passes",
      /isOverlayTemplate\(body\.overlayTemplate\)\)\s*\{?\s*patch\.overlay_template = body\.overlayTemplate/.test(route))
    // The decisive negative — the stale duplicate must be gone, not merely extended.
    ok("NO hard-coded template Set remains in the route",
      !/OVERLAY_TEMPLATE_SET/.test(route))
    ok("…and the route hard-codes no template keys at all",
      !/"(market_type_centered|your_sign|special_feature|next_property|upgrade|apartment_standards|pov_upgrade)"/.test(route))
    ok("it imports the validator from the canonical module",
      /import \{ isOverlayTemplate \} from "@\/lib\/social\/composePost"/.test(read(ROUTE)))
  }

  console.log("\nEVERY CANONICAL TEMPLATE IS ACCEPTED (iterates the list, not a copy):")
  {
    ok(`the canonical list is non-trivial (${OVERLAY_TEMPLATES.length} templates)`, OVERLAY_TEMPLATES.length >= 16)
    const rejected = OVERLAY_TEMPLATES.filter((t) => !isOverlayTemplate(t))
    ok("isOverlayTemplate accepts ALL of them", rejected.length === 0, `rejected: ${JSON.stringify(rejected)}`)

    // Named explicitly because these are the ones that were broken in production.
    for (const [label, key] of [
      ["Template 1", "market_type"], ["Template 2", "market_type_centered"],
      ["Template 7", "apartment_standards"], ["Template 8", "pov_upgrade"],
      ["Template 10", "pov_price"], ["Template 16", "what_mo_gets_you_top"],
    ] as const) {
      const i = (OVERLAY_TEMPLATES as readonly string[]).indexOf(key)
      ok(`${label} (${key}) is canonical and accepted`, i >= 0 && isOverlayTemplate(key))
    }

    // What the OLD set allowed — proof the 11 were genuinely excluded before.
    const OLD = new Set(["market_type", "your_sign", "special_feature", "next_property", "upgrade"])
    const wereBroken = OVERLAY_TEMPLATES.filter((t) => !OLD.has(t))
    ok(`${wereBroken.length} templates were previously dropped and now pass`,
      // Was 12; grows with each template added after the original five. The POINT of the
      // assertion is that every non-legacy key now persists, not the count itself.
      wereBroken.length === OVERLAY_TEMPLATES.length - OLD.size && wereBroken.every((t) => isOverlayTemplate(t)),
      JSON.stringify(wereBroken))
  }

  console.log("\nINVALID VALUES ARE STILL REFUSED (the fix must not open the gate):")
  {
    for (const bad of ["", "not_a_template", "MARKET_TYPE", "market type", "../../etc", "drop table"]) {
      ok(`"${bad}" is rejected`, !isOverlayTemplate(bad))
    }
    for (const bad of [null, undefined, 42, {}, [], true]) {
      ok(`${JSON.stringify(bad) ?? "undefined"} is rejected`, !isOverlayTemplate(bad))
    }
  }

  console.log("\nONE SOURCE OF TRUTH — API, EDITOR AND LIBRARY AGREE:")
  {
    // The dropdown now renders OVERLAY_TEMPLATE_ORDER, which is a DISPLAY sequence derived from
    // the canonical registry — not a hand-written second list. The invariant this assertion
    // protects is unchanged: the operator can only select a registered template. That the two
    // lists hold the same set is asserted in scripts/social/templates25to31.
    ok("the editor's dropdown is built from the canonical display order",
      /OVERLAY_TEMPLATE_ORDER\.map\(\(t, i\) =>/.test(editor))
    ok("…and that order is derived from OVERLAY_TEMPLATES, not re-typed",
      /OVERLAY_TEMPLATE_ORDER: readonly OverlayTemplate\[\] = \[\s*\n\s*\.\.\.OVERLAY_TEMPLATES\.slice/.test(
        readFileSync(path.join(process.cwd(), "lib/social/composePost.ts"), "utf8")))
    ok("the editor hydrates through the canonical list",
      /\(OVERLAY_TEMPLATES as readonly string\[\]\)\.includes\(p\.overlayTemplate \?\? ""\)/.test(editor))
    ok("the Video Library preview validates through the canonical list too",
      /\(OVERLAY_TEMPLATES as readonly string\[\]\)\.includes\(newest\.overlayTemplate \?\? ""\)/.test(library))
    // The three surfaces now share one list, so a value the editor can select is a
    // value the API stores and the library can draw.
    ok("…so anything selectable is storable AND drawable",
      OVERLAY_TEMPLATES.every((t) => isOverlayTemplate(t)))
    ok("the default is itself canonical", isOverlayTemplate(DEFAULT_OVERLAY_TEMPLATE))
  }

  console.log("\nUNRELATED DRAFT FIELDS ARE NEVER TOUCHED:")
  {
    // The patch object is assembled key-by-key, each behind a `"field" in body`
    // guard, so a Save Draft that omits a field cannot write it. This is what makes
    // the fix safe for existing drafts: nothing is normalized or regenerated.
    const guarded = [
      "postName", "caption", "socialSpecial", "onVideoText", "overlayHeadline",
      "overlaySubheadline", "overlayMode", "overlayTemplate", "hashtags",
    ]
    for (const f of guarded) {
      ok(`${f} is written only when present in the body`,
        new RegExp(`"${f}" in body`).test(route))
    }
    ok("the patch starts with ONLY updated_at",
      /const patch: Record<string, unknown> = \{ updated_at: new Date\(\)\.toISOString\(\) \}/.test(route))
    ok("protected columns are still never patched",
      !/patch\.(owner_user_id|source_content_id|platform|published_at|rendered_storage_path|render_version)\s*=/.test(route))
    ok("pricing/amenities live on social_content and this route never writes them",
      !/patch\.(budget_range|amenities|property_name|market)\s*=/.test(route))
    // REWRITTEN 2026-10-08. This required `renderAffecting = true` beside the template guard —
    // the PRESENCE-based rule that was itself the bug: it fired on every save, so a schedule-only
    // edit threw away a valid MP4. Invalidation is now change-based, so the property is asserted
    // against the canonical list and by behaviour instead of by source spelling.
    ok("overlay_template is on the canonical render-affecting list",
      (RENDER_AFFECTING_COLUMNS as readonly string[]).includes("overlay_template"))
    ok("changing the template still invalidates the render",
      shouldInvalidateRender({ overlay_template: "market_type" }, { overlay_template: "special_feature" }))
    ok("…but re-saving the SAME template does not",
      !shouldInvalidateRender({ overlay_template: "market_type" }, { overlay_template: "market_type" }))
    ok("the route decides it by comparing against the stored row",
      /renderAffectingChanges\(stored, patch\)/.test(route) && !/renderAffecting = true/.test(route))
  }

  console.log("\nNO BACKFILL, NO MIGRATION, NO BULK WRITE:")
  {
    ok("the route updates exactly one row by id",
      /\.from\("social_posts"\)\.update\(patch\)\.eq\("id", id\)/.test(route))
    ok("…and no update without an id filter exists in the route",
      !/\.update\([^)]*\)(?!\s*\.eq\("id")/.test(route.replace(/\.update\(patch\)\.eq\("id", id\)/g, "")))
    ok("the fix adds no migration file",
      !require("node:fs").existsSync(path.join(process.cwd(), "supabase/migrations/overlay_template_backfill.sql")))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
