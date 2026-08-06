// Companion extension-client allowlist (Milestone B).
//
// The current unpacked-extension ID is NEVER treated as the permanent
// production ID. Production accepts ONLY the exact Chrome Web Store extension ID
// from COMPANION_PROD_EXTENSION_ID — a required deploy value — and FAILS CLOSED
// if it is missing. Unpacked/dev testing uses COMPANION_DEV_EXTENSION_IDS
// (comma-separated), which must never be populated in production config.

function isProduction(): boolean {
  return process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
}

/** The documented, required production Chrome Web Store extension ID. */
export function prodExtensionId(): string | null {
  const v = process.env.COMPANION_PROD_EXTENSION_ID?.trim();
  return v ? v : null;
}

function devExtensionIds(): string[] {
  return (process.env.COMPANION_DEV_EXTENSION_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Whether an extension ID is an accepted Companion client.
 * Production: must equal COMPANION_PROD_EXTENSION_ID; throws (fail closed) if
 * that env var is missing. Dev/preview: the prod ID (if set) OR a dev-allowlist
 * entry. Dev IDs are ignored entirely in production.
 */
export function isAllowedExtensionId(extensionId: string | null | undefined): boolean {
  const ext = (extensionId ?? "").trim();
  if (!ext) return false;
  const prod = prodExtensionId();
  if (isProduction()) {
    if (!prod) {
      // Fail closed: refuse to authorize any client rather than trusting an
      // unverified extension ID in production.
      throw new Error("COMPANION_PROD_EXTENSION_ID is required in production (Companion auth fails closed).");
    }
    return ext === prod;
  }
  return (!!prod && ext === prod) || devExtensionIds().includes(ext);
}
