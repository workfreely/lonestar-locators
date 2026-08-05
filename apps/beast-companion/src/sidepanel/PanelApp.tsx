import { useEffect, useState } from "react";
import { LogoLockup, LogoMark } from "@/components/Logo";
import { VERSION } from "@/utils/constants";

/**
 * The Companion's single interface, rendered in the native side panel.
 *
 * Phase-1 shell: a branded header with a close control, and centered placeholder
 * content. Kept presentational so the real surfaces (active client, workflow,
 * best matches, property actions) drop into the body later without touching the
 * open/close/panel lifecycle.
 *
 * The small width readout in the footer is a Phase-A diagnostic for the
 * resize/divider test and will be removed once the native shell is confirmed.
 */
export function PanelApp() {
  const [width, setWidth] = useState<number>(() => window.innerWidth);

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <div className="bc-panel">
      <header className="bc-panel-header">
        <LogoLockup />
        <button
          type="button"
          className="bc-close"
          onClick={() => window.close()}
          aria-label="Close Beast Companion"
          title="Close Beast Companion"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
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

      <footer className="bc-panel-diag">Panel width: {width}px</footer>
    </div>
  );
}
