import { useState } from "react";

// Shared Companion property thumbnail — the ONE treatment for Current Property
// (and, later, Recommendation/Favorite rows). Mirrors the Workspace PropertyThumb
// (components/crm/PropertyThumb.tsx) building placeholder so the Companion and the
// CRM show the same fallback; it's re-implemented here (not imported) only because
// the CRM component uses --crm-* tokens and can't cross the extension build.
// A missing src OR a load error both fall back to the same clean building
// placeholder — never a broken-image glyph.
export function PropertyThumb({
  src,
  alt = "",
  size = 46,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = !!src && !errored;
  const dim = { width: size, height: size } as const;

  if (showImage) {
    return (
      <div className="bc-prop-thumb" style={dim}>
        <img
          src={src as string}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
        />
      </div>
    );
  }

  return (
    <div className="bc-prop-thumb bc-prop-thumb--empty" style={dim} aria-hidden>
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 21h18" />
        <path d="M5 21V5a1 1 0 011-1h7a1 1 0 011 1v16" />
        <path d="M14 21V9a1 1 0 011-1h3a1 1 0 011 1v12" />
        <path d="M8 8h2M8 12h2M8 16h2" />
      </svg>
    </div>
  );
}
