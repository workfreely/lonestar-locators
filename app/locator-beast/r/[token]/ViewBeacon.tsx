"use client"

import { useEffect, useRef } from "react"

/**
 * Records that a real person opened this recommendation list.
 *
 * Deliberately a CLIENT component with no UI. Two things follow from that and both are the point:
 *   • the request is awaited by /api/r/view, so it actually lands — the previous server-side
 *     fire-and-forget call never did;
 *   • link-preview crawlers (iMessage, Facebook, Slack) fetch the page HTML but do not execute
 *     JavaScript, so an unfurl no longer counts as a view the way the server render did.
 *
 * `disabled` is the agent's own Preview. Opening a client's list to check it is not a client view,
 * and before this the two were indistinguishable — the agent's Preview click and their own link
 * unfurls would both have shown up as "the client looked at it".
 *
 * The ref guard makes this fire ONCE per mount, so React Strict Mode's double-effect in development
 * cannot produce two beacons. It is belt-and-braces rather than load-bearing: the 30-minute
 * sessionization in lb_record_client_share_view already collapses repeat calls into one session, so
 * even a duplicate could not inflate view_session_count.
 */
export default function ViewBeacon({ token, disabled }: { token: string; disabled?: boolean }) {
  const sent = useRef(false)

  useEffect(() => {
    if (disabled || sent.current) return
    sent.current = true
    // Failure is silent and non-fatal: a missed view stat must never surface an error to a client
    // who is simply looking at their apartments.
    void fetch("/api/r/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true, // survives a fast tap-through to another page
    }).catch(() => {})
  }, [token, disabled])

  return null
}
