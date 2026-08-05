import { BRAND } from "@/utils/constants";

/**
 * The Locator Beast brand mark — a blue rounded square containing a white
 * upward chevron. Rendered as inline SVG (no image asset) so it stays crisp at
 * any size inside the Shadow DOM and needs no web_accessible_resources.
 *
 * This mirrors the CRM's mark so the companion feels like the same product.
 */
export function LogoMark({ size = 28, radius = 8 }: { size?: number; radius?: number }) {
  const stroke = Math.max(2, Math.round(size * 0.14));
  return (
    <span
      className="bc-logo-mark"
      style={{ width: size, height: size, borderRadius: radius, background: BRAND.blue }}
      aria-hidden="true"
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 14 14" fill="none">
        <path
          d="M2 10L7 4L12 10"
          stroke="#ffffff"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/** The mark plus the "Locator Beast" wordmark, used in the panel header. */
export function LogoLockup() {
  return (
    <span className="bc-logo-lockup">
      <LogoMark size={26} radius={7} />
      <span className="bc-logo-wordmark">Locator Beast</span>
    </span>
  );
}
