import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { recordSecurityEvent } from "@/lib/security/events"
import { DEVICE_COOKIE, deviceCookieOptions, recognizeOrEnrollDevice } from "@/lib/security/trustedDevice"

// Security Beast — server-side hook for the EMAIL/PASSWORD login, which happens
// entirely client-side (supabase.auth.signInWithPassword) and so has no server
// observation point of its own. Right after a successful sign-in the login page
// fires a best-effort POST here; this route records the 'login' event with
// SERVER-observed IP / user-agent / country (read from the request headers).
//
// SECURITY: the client sends NO body. The subject is resolved server-side from
// the freshly-established session cookie (auth.getUser validates the JWT), and
// the event type/method are fixed here — so a caller can only ever record its
// OWN login event, never forge one for another user or with arbitrary fields.
// No session with a valid user → 401 and nothing is recorded.
//
// FAIL-OPEN: recordSecurityEvent never throws, and this route always returns a
// 200 on the happy path regardless of whether the insert succeeded — a logging
// failure can never surface to, or disrupt, the just-signed-in user.
export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    // Trusted-device recognition (best-effort). Read the presented device cookie,
    // recognize it for THIS user or enroll a new one, and — when new — write the
    // fresh raw credential back as an httpOnly cookie. Never blocks login.
    const cookieStore = await cookies()
    const presented = cookieStore.get(DEVICE_COOKIE)?.value
    const device = await recognizeOrEnrollDevice({
      userId: user.id,
      presentedCookie: presented,
      headers: req.headers,
    })
    if (device.newCookieValue) {
      cookieStore.set(DEVICE_COOKIE, device.newCookieValue, deviceCookieOptions())
    }

    await recordSecurityEvent({
      userId: user.id,
      eventType: "login",
      method: "password",
      headers: req.headers,
      // Non-secret device context only — status + the row id, never the credential.
      metadata: { device: device.status, trusted_device_id: device.deviceId },
    })
  } catch {
    // Fail-open — never let a telemetry error affect the client.
  }
  return NextResponse.json({ ok: true })
}
