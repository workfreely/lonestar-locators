/**
 * Off-project backup of Supabase Storage for Locator Beast.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE DATABASE BACKUP.
 * Supabase database backups — daily on Pro, and PITR if it is ever enabled —
 * NEVER include Storage. A database restore therefore brings back rows whose
 * profiles.profile_photo_url points at objects that no longer exist, leaving a
 * broken image on every public Smart Form. Storage has to be backed up on its
 * own or it is simply not backed up.
 *
 * WHAT IT PRESERVES.
 * The exact `<bucket>/<user-uuid>/<filename>` path, byte-for-byte. That path is
 * the restore key: storage RLS scopes writes to `(storage.foldername(name))[1]
 * = auth.uid()`, and the public URL embeds the same path, so restoring to the
 * identical path makes existing database URLs work again with no row edits.
 *
 * THE MANIFEST is the other half. It records, per object, which profiles.id /
 * workspaces.id column referenced it — so if an object ever has to come back
 * under a different name, you know exactly which row to repair. It also flags
 * ORPHANS: objects no database row references.
 *
 * Reads use the service-role key server-side only. Files are written with 0600
 * into a vault outside the repository.
 *
 * Usage:
 *   npx tsx scripts/backup/storage-backup.mts --dry-run   # inventory only, writes nothing
 *   npx tsx scripts/backup/storage-backup.mts             # download + manifest
 */
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const DRY = process.argv.includes("--dry-run")
const VAULT = process.env.LB_BACKUP_DIR ?? path.join(process.env.HOME!, "LocatorBeastBackups")

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string] })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

type Obj = {
  bucket: string; path: string; size: number; mimetype: string | null
  updated_at: string | null; sha256?: string
  referenced_by: { table: string; id: string; column: string }[]
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")
const outDir = path.join(VAULT, "storage", stamp)

async function main() {
  const { data: buckets, error } = await supabase.storage.listBuckets()
  if (error) throw new Error(`listBuckets: ${error.message}`)

  // Every DB column that can point at a storage object. Extend this list when a
  // new upload feature lands, or its files will silently look orphaned.
  const refs = new Map<string, { table: string; id: string; column: string }[]>()
  const add = (url: string | null, table: string, id: string, column: string) => {
    if (!url) return
    const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/(.+?)(?:\?|$)/)
    if (!m) return
    const key = decodeURIComponent(m[1])
    if (!refs.has(key)) refs.set(key, [])
    refs.get(key)!.push({ table, id, column })
  }
  const { data: profiles } = await supabase.from("profiles").select("id, profile_photo_url, business_logo_url")
  for (const p of (profiles ?? []) as any[]) {
    add(p.profile_photo_url, "profiles", p.id, "profile_photo_url")
    add(p.business_logo_url, "profiles", p.id, "business_logo_url")
  }
  const { data: workspaces } = await supabase.from("workspaces").select("id, logo_url")
  for (const w of (workspaces ?? []) as any[]) add(w.logo_url, "workspaces", w.id, "logo_url")

  const objects: Obj[] = []
  for (const b of buckets) {
    const walk = async (prefix: string) => {
      const { data: entries } = await supabase.storage.from(b.name).list(prefix, { limit: 1000 })
      for (const e of entries ?? []) {
        const full = prefix ? `${prefix}/${e.name}` : e.name
        // A listing row with no metadata is a folder, not an object.
        if (!(e as any).metadata) { await walk(full); continue }
        objects.push({
          bucket: b.name,
          path: full,
          size: (e as any).metadata?.size ?? 0,
          mimetype: (e as any).metadata?.mimetype ?? null,
          updated_at: (e as any).updated_at ?? null,
          referenced_by: refs.get(`${b.name}/${full}`) ?? [],
        })
      }
    }
    await walk("")
  }

  const totalBytes = objects.reduce((n, o) => n + o.size, 0)
  const orphans = objects.filter((o) => o.referenced_by.length === 0)
  console.log(`  buckets: ${buckets.length}   objects: ${objects.length}   ${(totalBytes / 1048576).toFixed(2)} MB`)
  console.log(`  referenced: ${objects.length - orphans.length}   orphaned: ${orphans.length}`)
  console.log(`  destination: ${outDir}`)

  if (DRY) {
    console.log("\n  DRY RUN — nothing written. Objects that WOULD be backed up:")
    for (const o of objects) {
      const tag = o.referenced_by.length
        ? o.referenced_by.map((r) => `${r.table}.${r.column}`).join(",")
        : "ORPHAN (kept, not deleted)"
      console.log(`    ${o.bucket}/${o.path}  ${(o.size / 1024).toFixed(1)} KB  ← ${tag}`)
    }
    return
  }

  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 })
  for (const o of objects) {
    const { data, error: dErr } = await supabase.storage.from(o.bucket).download(o.path)
    if (dErr || !data) { console.error(`  !! failed ${o.bucket}/${o.path}: ${dErr?.message}`); continue }
    const buf = Buffer.from(await data.arrayBuffer())
    o.sha256 = crypto.createHash("sha256").update(buf).digest("hex")
    // Exact bucket/path structure — this is what makes restore a straight re-upload.
    const dest = path.join(outDir, o.bucket, o.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 })
    fs.writeFileSync(dest, buf, { mode: 0o600 })
  }

  const manifest = {
    stamp,
    project_ref: process.env.LB_PROJECT_REF ?? "onwrrajmklxtnabekzcy",
    generated_at: new Date().toISOString(),
    bucket_count: buckets.length,
    object_count: objects.length,
    total_bytes: totalBytes,
    orphan_count: orphans.length,
    buckets: buckets.map((b) => ({ name: b.name, public: b.public })),
    objects,
  }
  const mPath = path.join(outDir, "manifest.json")
  fs.writeFileSync(mPath, JSON.stringify(manifest, null, 2), { mode: 0o600 })
  console.log(`\n  ✓ ${objects.length} objects + manifest.json → ${outDir}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
