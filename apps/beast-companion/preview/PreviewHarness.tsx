import { useEffect, useState } from "react";
import { THEME_IDS, type ThemeId } from "@bc/companion-shared";
import { PanelApp } from "@/sidepanel/PanelApp";
import { applyTheme } from "@/sidepanel/applyTheme";
import { NON_LOADED_STATES, type PanelState } from "@/sidepanel/lead/PanelStates";
import { DEMO_FIXTURES, DEFAULT_FIXTURE_KEY } from "@/sidepanel/lead/fixtures";
import type { CompanionConnection } from "@/sidepanel/connection";

function connectionFor(state: PanelState): CompanionConnection {
  if (state === "not-connected") return { status: "disconnected" };
  if (state === "connecting") return { status: "connecting" };
  return { status: "connected", name: "Jordan Demo", workspace: "Demo Workspace" };
}

/**
 * TEMPORARY Phase 3 preview harness. Renders the real PanelApp at FULL native
 * side-panel width (no fixed-width frame) so Chrome's resizable divider tests the
 * true 360–600px behavior. Sanitized fixtures only; no network, Supabase, API, or
 * storage. Defaults to the loaded demo-client state. Clearly banners itself so it
 * can't be mistaken for production.
 */

const ALL_STATES: PanelState[] = ["loaded", ...NON_LOADED_STATES];

export function PreviewHarness() {
  const [fixtureKey, setFixtureKey] = useState(DEFAULT_FIXTURE_KEY);
  const [state, setState] = useState<PanelState>("loaded");
  const [theme, setTheme] = useState<ThemeId>("midnight");

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const fixture = DEMO_FIXTURES.find((f) => f.key === fixtureKey) ?? DEMO_FIXTURES[0];

  return (
    <div className="pv-wrap">
      <style>{`
        .pv-wrap { display:flex; flex-direction:column; height:100vh; height:100dvh; background:var(--lb-background); }
        .pv-banner { flex:none; display:flex; align-items:center; justify-content:center; gap:8px;
          padding:5px 10px; background:#7c2d12; color:#fed7aa; font:700 11px/1.2 -apple-system,sans-serif;
          letter-spacing:.1em; text-transform:uppercase; }
        .pv-banner b { color:#fff; }
        .pv-bar { flex:none; display:flex; flex-wrap:wrap; gap:8px; align-items:center;
          padding:6px 10px; background:#0b0f1a; color:#8b93a0; border-bottom:1px solid #1b2030;
          font:600 11px/1.2 -apple-system,sans-serif; }
        .pv-bar label { display:flex; align-items:center; gap:4px; }
        .pv-bar select { background:#12151f; color:#f4f6fb; border:1px solid #2b3242; border-radius:6px; padding:3px 5px; font:inherit; max-width:150px; }
        .pv-stage { flex:1; min-height:0; }
        .pv-stage .bc-panel { height:100%; }
      `}</style>

      <div className="pv-banner">
        <span aria-hidden>⚠️</span> Preview — <b>Sanitized Data</b>
      </div>

      <div className="pv-bar">
        <label>
          Client
          <select value={fixtureKey} onChange={(e) => setFixtureKey(e.target.value)}>
            {DEMO_FIXTURES.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          State
          <select value={state} onChange={(e) => setState(e.target.value as PanelState)}>
            {ALL_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Theme
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
            {THEME_IDS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pv-stage">
        <PanelApp
          state={state}
          lead={state === "loaded" ? fixture.lead : null}
          nextActions={state === "loaded" ? fixture.nextActions : []}
          connection={connectionFor(state)}
          onConnect={() => setState("loaded")}
          onDisconnect={() => setState("not-connected")}
        />
      </div>
    </div>
  );
}
