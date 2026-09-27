// Control Center route bases — a plain module so BOTH server and client components can import them
// (a "use client" module's non-component exports become client references on the server).
export const CC_BASE = "/admin/control-center"
export const PI_BASE = `${CC_BASE}/property-intelligence`
