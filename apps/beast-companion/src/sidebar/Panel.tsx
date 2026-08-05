import { LogoLockup, LogoMark } from "@/components/Logo";
import { VERSION } from "@/utils/constants";

/**
 * The expanded, full-height panel. Phase 1 is a placeholder shell: a branded
 * header with a clear close control, and centered "coming soon" content.
 *
 * Keeping this a dumb presentational component (state lives in App) means the
 * real feature surfaces — property matches, approval intelligence, CRM actions —
 * can be dropped into the body later without touching open/close/layout logic.
 */
export function Panel({ onClose }: { onClose: () => void }) {
  return (
    <section className="bc-panel" role="dialog" aria-label="Beast Companion">
      <header className="bc-panel-header">
        <LogoLockup />
        <button
          type="button"
          className="bc-close"
          onClick={onClose}
          aria-label="Close Beast Companion"
          title="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </header>

      <div className="bc-panel-body">
        <div className="bc-hero">
          <LogoMark size={56} radius={14} />
          <h1 className="bc-title">Beast Companion</h1>
          <p className="bc-subtitle">Chrome Extension</p>
          <span className="bc-version">Version {VERSION}</span>
          <span className="bc-badge">Coming Soon</span>
        </div>
      </div>
    </section>
  );
}
