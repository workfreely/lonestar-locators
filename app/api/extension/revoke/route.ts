export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyAccessBearer, revokeConnection } from "@/lib/companion/extensionAuth";
import { enforceRateLimit, clientIpFromHeaders } from "@/lib/companion/extensionRateLimit";

// POST /api/extension/revoke  (Disconnect)
//
// The connection to revoke is derived ENTIRELY from the verified access Bearer
// token — never from a client-supplied connection id. Verifying the Bearer also
// revalidates membership/entitlement, but even a still-valid token may only
// revoke ITS OWN connection.

export async function POST(req: Request) {
  const ip = clientIpFromHeaders(req.headers);
  const rl = await enforceRateLimit([{ key: `ext:revoke:ip:${ip}`, limit: 30, windowSeconds: 60 }]);
  if (!rl.ok) return rl.response;

  const auth = await verifyAccessBearer(req);
  if (!auth.ok) return auth.response;

  await revokeConnection(auth.connectionId); // from the verified token, not the body
  return NextResponse.json({ revoked: true });
}
