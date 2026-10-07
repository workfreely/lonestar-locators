// PRICE PARITY — does the price we SHOW equal the price Stripe will CHARGE?
//
// Three numbers can drift apart, and nothing in the app notices if they do:
//
//   1. MONTHLY_PRICE_USD   (lib/billing/trial.ts)  — the marketing-site figure
//   2. PLANS[].priceUsd    (lib/billing/plans.ts)  — the billing-UI figure
//   3. the Stripe Price's unit_amount behind PLANS[].priceIdEnv — what is ACTUALLY billed
//
// A Stripe Price's amount is IMMUTABLE, so every price change means a NEW Price object and a
// repointed env var. That is the whole failure mode: the constants are edited in a commit, the
// env var is changed in a different place at a different time, and the two steps are not
// connected by anything. The site then advertises one price and charges another — silently, with
// no error, until a customer notices their card.
//
// WHY A SCRIPT AND NOT A RUNTIME ASSERT: the mismatch must be caught BEFORE deploy. A runtime
// check would discover it in production, during a real checkout, which is the one place a hard
// failure is unacceptable. This runs against whichever Stripe key is in the environment, so it
// is also the only way to confirm you repointed the env var in the mode you think you did.
//
// EXIT CODES — three outcomes, deliberately, not two:
//   0  VERIFIED   every displayed price was compared against a real Stripe Price and matched
//   1  MISMATCH   something disagrees — do not deploy
//   2  UNVERIFIED could not check (no key, no Price id, Stripe unreachable)
//
// 2 is NOT a pass. "I could not look" and "I looked and it was fine" are different facts, and
// collapsing them is how a check like this ends up reporting green while the thing it guards is
// broken. Nothing here writes to Stripe, and no subscription is read or modified.
//
// Run: npx tsx scripts/billing/priceParity.check.ts
import { readFileSync, existsSync } from "node:fs"
import path from "node:path"

// Match the other scripts: load .env.local without clobbering anything already exported, so CI
// and `STRIPE_SECRET_KEY=sk_live_... npx tsx ...` both override the file rather than fight it.
const envFile = path.join(process.cwd(), ".env.local")
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const i = line.indexOf("=")
    if (i > 0 && !line.trimStart().startsWith("#")) process.env[line.slice(0, i).trim()] ??= line.slice(i + 1).trim()
  }
}

import { PLANS, resolvePriceId, type Plan } from "@/lib/billing/plans"
import { MONTHLY_PRICE_USD, STANDARD_PRICE_USD, TRIAL_LENGTH_DAYS } from "@/lib/billing/trial"

let mismatches = 0
let unverified = 0
const ok = (label: string, pass: boolean, detail = "") => {
  if (pass) console.log(`  ✓ ${label}${detail && `  ${detail}`}`)
  else { mismatches++; console.log(`  ✗ ${label}${detail && `  ${detail}`}`) }
}
const skip = (label: string, why: string) => { unverified++; console.log(`  ? ${label}  — ${why}`) }

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`

// ── 1. STATIC: the two in-repo figures must agree with each other ───────────────────────────
// No network, so this half always runs and always means something, even with no Stripe access.
function staticChecks() {
  console.log("\nIN-REPO CONSISTENCY (no network):")
  const monthly = PLANS.locator_beast_monthly
  ok("the marketing figure and the billing-UI figure are the same number",
    MONTHLY_PRICE_USD === monthly.priceUsd,
    `MONTHLY_PRICE_USD=${MONTHLY_PRICE_USD}  PLANS.priceUsd=${monthly.priceUsd}`)

  // The founding rate must be BELOW the "future standard price" it is framed against. If this
  // ever inverts, the pricing page claims a discount while quoting a higher number.
  ok("the founding rate is below the future standard price",
    MONTHLY_PRICE_USD < STANDARD_PRICE_USD,
    `${MONTHLY_PRICE_USD} < ${STANDARD_PRICE_USD}`)

  ok("the trial length is a positive whole number of days",
    Number.isInteger(TRIAL_LENGTH_DAYS) && TRIAL_LENGTH_DAYS > 0,
    `${TRIAL_LENGTH_DAYS} days`)

  // Every plan needs a distinct env var, or two plans silently resolve to the same Stripe Price.
  const envs = Object.values(PLANS).map((p) => p.priceIdEnv)
  ok("each plan reads its own env var", new Set(envs).size === envs.length, envs.join(", "))
}

// ── 2. LIVE: compare each displayed price against the real Stripe Price ─────────────────────
async function stripeChecks() {
  console.log("\nAGAINST STRIPE:")
  if (!process.env.STRIPE_SECRET_KEY) {
    skip("every plan", "STRIPE_SECRET_KEY is not set in this environment")
    return
  }

  // Imported lazily: lib/stripe/client throws on first property access when the key is missing,
  // and that must surface as UNVERIFIED above rather than an unhandled rejection here.
  const { stripe } = await import("@/lib/stripe/client")

  // WHICH MODE did we just verify? Verifying the test Price and shipping the live one is the
  // exact mistake this script exists to prevent, so the mode is reported, never assumed.
  const mode = process.env.STRIPE_SECRET_KEY.startsWith("sk_live_") ? "LIVE" : "TEST"
  console.log(`  (key is ${mode} mode — this proves nothing about the other mode)`)

  for (const plan of Object.values(PLANS) as Plan[]) {
    const priceId = resolvePriceId(plan)
    if (!priceId) {
      skip(`${plan.key}`, `${plan.priceIdEnv} is not set`)
      continue
    }

    let price: Awaited<ReturnType<typeof stripe.prices.retrieve>>
    try {
      price = await stripe.prices.retrieve(priceId)
    } catch (e) {
      // A deleted/!wrong-mode Price id lands here. Unverified, not a mismatch: we learned nothing
      // about the amount, only that we could not read it.
      skip(`${plan.key} (${priceId})`, `Stripe could not retrieve it — ${(e as Error).message}`)
      continue
    }

    const expectedCents = plan.priceUsd * 100
    console.log(`\n  ${plan.key} → ${priceId}`)
    ok("amount charged equals amount displayed",
      price.unit_amount === expectedCents,
      `Stripe ${price.unit_amount === null ? "null" : usd(price.unit_amount)} vs displayed ${usd(expectedCents)}`)
    ok("billing interval matches",
      price.recurring?.interval === plan.interval,
      `Stripe ${price.recurring?.interval ?? "(not recurring)"} vs ${plan.interval}`)
    ok("interval count is 1", price.recurring?.interval_count === 1, `${price.recurring?.interval_count}`)
    ok("currency is usd", price.currency === "usd", price.currency)
    ok("the Price is active", price.active === true, String(price.active))
    // A Price's livemode must agree with the key that read it; disagreement is impossible via the
    // API, so this is really a guard against a future refactor passing a cross-mode id through.
    ok(`the Price is in ${mode} mode`, price.livemode === (mode === "LIVE"), `livemode=${price.livemode}`)
  }
}

async function main() {
  console.log("PRICE PARITY — displayed price vs configured Stripe Price")
  staticChecks()
  await stripeChecks()

  console.log("\n" + "─".repeat(68))
  if (mismatches > 0) {
    console.log(`MISMATCH — ${mismatches} check(s) failed. DO NOT DEPLOY.`)
    console.log("A price change needs BOTH halves: the constants in this repo AND a new Stripe")
    console.log("Price with its env var repointed. Fix whichever half is stale.")
    process.exit(1)
  }
  if (unverified > 0) {
    console.log(`UNVERIFIED — ${unverified} check(s) could not run. This is NOT a pass.`)
    console.log("Supply STRIPE_SECRET_KEY and the plan's Price id env var, then re-run before deploying.")
    process.exit(2)
  }
  console.log("VERIFIED — every displayed price matches its Stripe Price.")
}

main().catch((e) => {
  console.error("\nUNVERIFIED — the check itself failed:", e)
  process.exit(2)
})
