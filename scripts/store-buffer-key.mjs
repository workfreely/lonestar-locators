// STORE A BUFFER API KEY IN VAULT. Run by hand; stores one key and prints nothing secret.
//
// ── WHY A SCRIPT AND NOT A psql PASTE ───────────────────────────────────────────────────────
// A key pasted into SQL lands in the statement log, in the shell history and in the terminal
// scrollback, and a key that has been in any of those three places has to be rotated. This passes
// it as a BIND PARAMETER to sa_set_buffer_api_key, which hands it straight to Vault: only the
// ciphertext and a pointer persist, and the plaintext exists only in this process's memory.
//
// The key is read from a 0600 file and is never echoed, never logged, never put in argv (where
// `ps` would show it) and never included in an error message. The only thing printed is the
// account id the RPC returns, which is not a secret.
//
//   node scripts/store-buffer-key.mjs --label Jay     --org 6b01f357d307eb797108b033 --file ~/.buffer/api-key
//   node scripts/store-buffer-key.mjs --label Lisette --org 6b02f92207e3daab800671f4 --file ~/.buffer/lisette-api-key
//
// ROTATING an existing account's key: pass --account <social_buffer_accounts.id>. Without it a new
// account row is created, which is what you want the first time and never again — the (owner,
// label) index will refuse a second row with the same label rather than create a duplicate.
//
// PREREQUISITE: supabase/prepared/20261122000000_buffer_publish_route.sql applied.
import { createClient } from "@supabase/supabase-js"
import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"

const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}
const label = arg("label")
const org = arg("org")
const file = arg("file")
const account = arg("account")
if (!label || !file) {
  console.error("usage: node scripts/store-buffer-key.mjs --label <Jay|Lisette> --file <path> [--org <id>] [--account <uuid>]")
  process.exit(2)
}

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const path = file.startsWith("~") ? file.replace(/^~/, homedir()) : file

// THE FILE'S PERMISSIONS ARE PART OF THE SECRET. A key readable by every process on the machine
// is already compromised; refusing here is cheap and the fix is one chmod.
const mode = statSync(path).mode & 0o777
if (mode & 0o077) {
  console.error(`refusing: ${path} is mode ${mode.toString(8)} — run: chmod 600 ${path}`)
  process.exit(1)
}

const key = readFileSync(path, "utf8").trim()
if (!key) { console.error(`refusing: ${path} is empty`); process.exit(1) }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data, error } = await db.rpc("sa_set_buffer_api_key", {
  p_owner_user_id: OWNER,
  p_account_id: account,
  p_label: label,
  p_key: key,                 // BOUND. supabase-js sends this as JSON in the request body, not SQL.
  p_organization_id: org,
})

if (error) {
  // The message is printed as the server sent it. sa_set_buffer_api_key never echoes p_key in any
  // of its exceptions, which is why this is safe to print — checked, not assumed.
  console.error(`failed: ${error.message}`)
  process.exit(1)
}
console.log(`stored. social_buffer_accounts.id = ${data}  (label "${label}", ${key.length} chars written to Vault)`)
