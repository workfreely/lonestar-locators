/**
 * Follow-up template OVERRIDES — validation + read/write data shape (CP2).
 *
 * Pure, dependency-free. Defines the shape of the workspace-level overrides
 * (`workspaces.follow_up_templates`), validates a raw override map for storage
 * (allowed keys + per-key max length, mirroring the server RPC), and merges
 * overrides onto the in-code defaults to get the effective text per key.
 *
 * Content only — no workflow/action_key/timing/stage coupling. "Store only
 * overridden keys; a missing key uses the default" is enforced here: empty and
 * exactly-default values are dropped so they fall back to the code default,
 * which is also how Reset-to-Default works (the key simply isn't stored).
 */
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_CHAR_LIMITS,
  type FollowUpTemplateKey,
} from "./followUpTemplates";

/** The content keys, derived from the default map (single source of truth). */
export const FOLLOW_UP_TEMPLATE_KEYS = Object.keys(
  DEFAULT_FOLLOW_UP_TEMPLATES,
) as FollowUpTemplateKey[];

export function isFollowUpTemplateKey(k: string): k is FollowUpTemplateKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_FOLLOW_UP_TEMPLATES, k);
}

/** Stored shape: only the customized keys. Absent key → code default. */
export type FollowUpOverrides = Partial<Record<FollowUpTemplateKey, string>>;

export type OverrideRejectReason = "unknown_key" | "not_a_string" | "too_long";

export type SanitizeResult = {
  /** Only valid, non-empty, in-range, genuinely-customized overrides. */
  overrides: FollowUpOverrides;
  /** Entries that were not stored, with why (for a soft UI warning). */
  rejected: Array<{ key: string; reason: OverrideRejectReason }>;
};

/**
 * Validate a raw override map for storage. Keeps only:
 *   • an allowed content key,
 *   • whose value is a string within its char limit,
 *   • that is non-empty after trimming, and
 *   • differs from the in-code default (equal-to-default is not a customization).
 * Empty / default values are dropped silently (→ they render the default).
 * Unknown keys, non-strings, and over-length values are rejected and reported
 * (never stored). The char limit counts the editable template text itself.
 */
export function sanitizeFollowUpOverrides(input: unknown): SanitizeResult {
  const overrides: FollowUpOverrides = {};
  const rejected: SanitizeResult["rejected"] = [];

  if (input == null || typeof input !== "object") return { overrides, rejected };

  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!isFollowUpTemplateKey(key)) {
      rejected.push({ key, reason: "unknown_key" });
      continue;
    }
    if (typeof raw !== "string") {
      rejected.push({ key, reason: "not_a_string" });
      continue;
    }
    if (raw.length > TEMPLATE_CHAR_LIMITS[key]) {
      rejected.push({ key, reason: "too_long" });
      continue;
    }
    // Empty (reset) or exactly the default → not a stored override.
    if (raw.trim() === "" || raw === DEFAULT_FOLLOW_UP_TEMPLATES[key]) continue;
    overrides[key] = raw;
  }

  return { overrides, rejected };
}

/**
 * Effective template text per key = override (if present) else the code default.
 * This is the read shape the send sites will consume (a later checkpoint). Pure.
 */
export function mergeFollowUpTemplates(
  overrides?: FollowUpOverrides | null,
): Record<FollowUpTemplateKey, string> {
  const out = {} as Record<FollowUpTemplateKey, string>;
  for (const key of FOLLOW_UP_TEMPLATE_KEYS) {
    const ov = overrides?.[key];
    out[key] = typeof ov === "string" && ov.trim() !== "" ? ov : DEFAULT_FOLLOW_UP_TEMPLATES[key];
  }
  return out;
}
