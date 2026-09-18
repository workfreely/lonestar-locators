import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import {
  isTourType,
  isTourWindow,
  isFutureOrTodayYmd,
  MAX_TOUR_DATES,
  type TourWindow,
} from "@bc/companion-shared"

// Public, token-scoped "Send My Availability" for a Client Recommendation list.
//
// Stores/updates the client's GENERAL availability (tour type + future dates + broad
// windows) and ensures the existing canonical setup_tour action is actionable — it
// never books a concrete lead_tours appointment. Validated here AND in the RPC so a
// public caller can never persist an unbounded/malformed blob. Same credential model
// as the favorite route; unknown/revoked/disabled shares are silent no-ops.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }

  const b = body as {
    token?: unknown
    tourType?: unknown
    dates?: unknown
  } | null

  const token = b?.token
  if (typeof token !== "string" || !looksLikeShareToken(token)) {
    return NextResponse.json({ error: "bad_token" }, { status: 400 })
  }
  if (!isTourType(b?.tourType)) {
    return NextResponse.json({ error: "bad_tour_type" }, { status: 400 })
  }
  if (!Array.isArray(b?.dates) || b.dates.length < 1 || b.dates.length > MAX_TOUR_DATES) {
    return NextResponse.json({ error: "bad_dates" }, { status: 400 })
  }

  // The client's local "today" (YYYY-MM-DD) travels in the payload so past-date
  // rejection matches what the calendar showed; the RPC re-checks against server date.
  const todayYmd = new Date().toISOString().slice(0, 10)
  const cleanDates: { date: string; windows: TourWindow[] }[] = []
  for (const d of b.dates) {
    const date = (d as { date?: unknown } | null)?.date
    const windows = (d as { windows?: unknown } | null)?.windows
    if (typeof date !== "string" || !isFutureOrTodayYmd(date, todayYmd)) {
      return NextResponse.json({ error: "bad_date" }, { status: 400 })
    }
    if (!Array.isArray(windows) || windows.length < 1 || !windows.every(isTourWindow)) {
      return NextResponse.json({ error: "bad_windows" }, { status: 400 })
    }
    cleanDates.push({ date, windows: windows as TourWindow[] })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_set_client_tour_availability", {
    p_token_hash: hashShareToken(token),
    p_tour_type: b.tourType,
    p_dates: cleanDates,
  })
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 })

  const row = (Array.isArray(data) ? data[0] : data) as { ok?: boolean } | null
  if (!row?.ok) return NextResponse.json({ error: "unavailable" }, { status: 409 })
  return NextResponse.json({ ok: true })
}
