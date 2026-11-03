/**
 * THE SUPABASE-SHAPED FRONT DOOR for the staging HTTP test.
 *
 * supabase-js talks to one origin and expects two services behind it: PostgREST under /rest/v1
 * and GoTrue under /auth/v1. PostgREST is real here — the actual binary, doing the actual query
 * translation, so the route's filters, its maybeSingle(), its optimistic-concurrency PATCH and
 * its insert all behave as they do in production.
 *
 * GoTrue is NOT real. Running the actual auth service needs Docker, and what the route asks of it
 * is narrow: auth.getUser() does GET /auth/v1/user with the access token and wants a user back.
 * So that one endpoint is answered here from a fixed table of tokens, which is also what lets the
 * test assert the UNAUTHENTICATED path — a request with no token gets 401 from this shim exactly
 * as it would from GoTrue, and requirePlatformAdmin turns that into its own 401.
 *
 * Everything it does NOT implement answers 501, loudly, rather than pretending.
 *
 *   node scripts/tests/approvalCriteria.authShim.cjs <listenPort> <postgrestPort>
 */
const http = require("node:http")

const PORT = Number(process.argv[2] || 3002)
const PGRST = Number(process.argv[3] || 3001)

const SECRET = process.env.APPROVAL_JWT_SECRET || ""
if (!SECRET) { console.error("APPROVAL_JWT_SECRET is required"); process.exit(2) }

const bearer = (req) => {
  const h = req.headers.authorization || ""
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m ? m[1].trim() : null
}

/**
 * The access token → the user, the way GoTrue would answer.
 *
 * The signature is VERIFIED against the same secret PostgREST uses, so a tampered or unsigned
 * token is rejected here exactly as it would be in production. That is what makes the
 * unauthenticated and the wrong-user cases in the test mean something: they are refused by a
 * signature check, not by a lookup table that happens to miss.
 */
const userFromToken = (token) => {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const expect = require("node:crypto").createHmac("sha256", SECRET)
    .update(`${parts[0]}.${parts[1]}`).digest("base64url")
  if (parts[2] !== expect) return null
  let claims
  try { claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) } catch { return null }
  if (!claims.sub) return null
  return { id: claims.sub, email: claims.email || `${claims.sub}@example.test` }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)

  if (url.pathname === "/auth/v1/user") {
    const user = userFromToken(bearer(req))
    res.writeHead(user ? 200 : 401, { "content-type": "application/json" })
    return res.end(JSON.stringify(user
      ? { id: user.id, aud: "authenticated", role: "authenticated", email: user.email,
          app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
      : { error: "invalid_token", error_description: "no such session" }))
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const target = url.pathname.replace("/rest/v1", "") + url.search
    const headers = { ...req.headers, host: `127.0.0.1:${PGRST}` }
    // PostgREST reads the role from the JWT in Authorization. supabase-js already sets it from
    // the key it was constructed with, so nothing is rewritten here.
    const proxy = http.request({ hostname: "127.0.0.1", port: PGRST, path: target, method: req.method, headers },
      (r) => { res.writeHead(r.statusCode || 500, r.headers); r.pipe(res) })
    proxy.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(e) })) })
    return req.pipe(proxy)
  }

  res.writeHead(501, { "content-type": "application/json" })
  res.end(JSON.stringify({ error: "not_implemented_by_shim", path: url.pathname }))
}).listen(PORT, "127.0.0.1", () => console.log(`shim listening on ${PORT} -> postgrest ${PGRST}`))
