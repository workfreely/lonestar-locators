import { lookup } from "node:dns/promises"
import net from "node:net"

/**
 * SSRF guard for routes that fetch a user-supplied URL server-side.
 *
 * The threat: our server sits inside a trusted network position. A URL the user
 * controls turns it into a proxy that can reach things they cannot — cloud
 * metadata (169.254.169.254), internal services on RFC1918 space, and anything
 * bound to loopback.
 *
 * Checking the hostname STRING is not enough, which is the trap the previous
 * implementation fell into: `isValidUrl` only required `hostname.includes(".")`,
 * and "127.0.0.1", "10.0.0.5" and "169.254.169.254" all satisfy that. An
 * attacker-controlled public hostname can also simply resolve to a private
 * address. So we resolve DNS and judge the RESULTING IPs — every one of them,
 * since a name can return several.
 */

// IPv4 ranges that must never be reachable from a user-supplied URL.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // RFC1918 private
  ["100.64.0.0", 10],    // CGNAT
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local — includes cloud metadata at 169.254.169.254
  ["172.16.0.0", 12],    // RFC1918 private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.168.0.0", 16],   // RFC1918 private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved (includes 255.255.255.255)
]

const v4ToInt = (ip: string) =>
  ip.split(".").reduce((acc, o) => ((acc << 8) + Number(o)) >>> 0, 0)

function isBlockedV4(ip: string): boolean {
  const addr = v4ToInt(ip)
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
    return (addr & mask) === (v4ToInt(base) & mask)
  })
}

function isBlockedV6(ip: string): boolean {
  const a = ip.toLowerCase().split("%")[0] // strip zone id
  if (a === "::1" || a === "::") return true
  // IPv4-mapped (::ffff:127.0.0.1) must be judged as the IPv4 address it carries.
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedV4(mapped[1])
  if (/^f[cd][0-9a-f]{2}:/.test(a)) return true   // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(a)) return true   // fe80::/10 link-local
  if (/^ff[0-9a-f]{2}:/.test(a)) return true      // ff00::/8 multicast
  return false
}

export function isBlockedAddress(ip: string): boolean {
  const v = net.isIP(ip)
  if (v === 4) return isBlockedV4(ip)
  if (v === 6) return isBlockedV6(ip)
  return true // unparseable → refuse
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

/**
 * Validates a single URL: scheme, then EVERY IP its hostname resolves to.
 * `reason` is for server logs only — callers must not return it to the client,
 * or the route becomes an internal-network oracle.
 */
export async function assertSafeUrl(raw: string): Promise<UrlCheck> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "unparseable" }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `scheme ${url.protocol}` }
  }
  // A bare IP literal never reaches DNS, so check it directly.
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (net.isIP(host)) {
    return isBlockedAddress(host) ? { ok: false, reason: `literal ${host}` } : { ok: true, url }
  }
  let records: { address: string }[]
  try {
    records = await lookup(host, { all: true })
  } catch {
    return { ok: false, reason: "dns failure" }
  }
  if (records.length === 0) return { ok: false, reason: "no dns records" }
  // ALL resolved addresses must be public. One private answer is enough to
  // refuse — otherwise a name returning both a public and a private address
  // could be raced into the private one.
  for (const r of records) {
    if (isBlockedAddress(r.address)) return { ok: false, reason: `resolves to ${r.address}` }
  }
  return { ok: true, url }
}

/**
 * Fetch that re-validates every redirect hop. `redirect: "manual"` is essential:
 * with automatic following, a public URL can 302 straight to
 * http://169.254.169.254/ and the guard above would never see it.
 *
 * NOTE ON RESIDUAL RISK: between validation and connection the name could be
 * re-resolved to a private address (DNS rebinding). Closing that fully means
 * pinning the validated IP and carrying the Host/SNI ourselves. This raises the
 * bar substantially without that complexity; if this route ever handles
 * untrusted input at scale, pin the socket.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<{ ok: true; response: Response; finalUrl: string } | { ok: false; reason: string }> {
  const maxRedirects = init.maxRedirects ?? 3
  let target = raw
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = await assertSafeUrl(target)
    if (!check.ok) return { ok: false, reason: `hop ${hop}: ${check.reason}` }
    const res = await fetch(check.url.href, { ...init, redirect: "manual" })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      if (!loc) return { ok: false, reason: "redirect without location" }
      target = new URL(loc, check.url).href   // resolve relative redirects
      continue
    }
    return { ok: true, response: res, finalUrl: check.url.href }
  }
  return { ok: false, reason: "too many redirects" }
}
