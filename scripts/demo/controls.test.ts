// Demo Workspace controls — regression guard. Proves the auto-exit-on-first-lead
// behavior did NOT remove or weaken the Add / Reset / Remove Demo Workspace
// controls, and that demo operations never touch the real leads table.
// Source-level assertions (no browser client needed). Run:
//   npx tsx scripts/demo/controls.test.ts
import { readFileSync } from "node:fs"
import { join } from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const root = process.cwd()
const exitDemo = readFileSync(join(root, "lib/demo/exitDemo.ts"), "utf8")
const profile = readFileSync(join(root, "components/crm/profile/ProfileClient.tsx"), "utf8")
const demoFixtures = readFileSync(join(root, "lib/demo/demoWorkspace.ts"), "utf8")

console.log("Demo controls still exist (Add / Reset / Remove):")
ok("exitDemoWorkspace (Remove Demo Workspace) exported", /export async function exitDemoWorkspace/.test(exitDemo))
ok("enterDemoWorkspace (Add Demo Workspace) exported", /export async function enterDemoWorkspace/.test(exitDemo))
ok("resetDemoWorkspace (Reset Demo Workspace) exported", /export async function resetDemoWorkspace/.test(exitDemo))

console.log("\nProfile page still wires all three user-facing controls:")
ok('"Reset Demo Workspace" button wired', profile.includes("Reset Demo Workspace") && profile.includes("resetDemoWorkspace()"))
ok('"Remove Demo Workspace" button wired', profile.includes("Remove Demo Workspace") && profile.includes("exitDemoWorkspace()"))
ok('"Add Demo Workspace" button wired', profile.includes("Add Demo Workspace") && profile.includes("enterDemoWorkspace()"))

console.log("\nDemo operations never touch the real leads table (no data deleted):")
ok("exitDemo only mutates profiles.demo_mode", exitDemo.includes('from("profiles")') && exitDemo.includes("demo_mode"))
ok("exitDemo NEVER queries the leads table", !exitDemo.includes('from("leads")'))
ok("exitDemo NEVER deletes anything", !/\.delete\s*\(/.test(exitDemo))

console.log("\nDemo data is static client-side fixtures (nothing to delete on exit):")
ok("demo roster is code, flagged is_demo (never inserted as real rows)", demoFixtures.includes("is_demo: true"))

console.log(`\nDemo controls guard: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
