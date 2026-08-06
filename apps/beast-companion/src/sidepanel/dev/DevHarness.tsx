import { useEffect, useState } from "react";
import { THEME_IDS, type ThemeId } from "@bc/companion-shared";
import { PanelApp } from "../PanelApp";
import { applyTheme } from "../applyTheme";
import { NON_LOADED_STATES, type PanelState } from "../lead/PanelStates";
import { DEMO_FIXTURES, DEFAULT_FIXTURE_KEY } from "../lead/fixtures";

/**
 * DEVELOPMENT-ONLY preview harness. Gated behind import.meta.env.DEV in main.tsx,
 * so it is never bundled into the production Companion build. Lets us switch the
 * sanitized fixture client, every interface state, the theme, and the preview
 * width (360 / 400 / 600) without live data, network, or storage.
 */

const WIDTHS = [360, 400, 600] as const;
const ALL_STATES: PanelState[] = ["loaded", ...NON_LOADED_STATES];

export function DevHarness() {
  const [fixtureKey, setFixtureKey] = useState(DEFAULT_FIXTURE_KEY);
  const [state, setState] = useState<PanelState>("loaded");
  const [theme, setTheme] = useState<ThemeId>("midnight");
  const [width, setWidth] = useState<number>(400);

  // Apply the theme to the document from the shared token registry.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const fixture = DEMO_FIXTURES.find((f) => f.key === fixtureKey) ?? DEMO_FIXTURES[0];

  return (
    <div className="dev-wrap">
      <style>{`
        .dev-wrap { height:100vh; display:flex; flex-direction:column; background:#05070d; }
        .dev-bar { flex:none; display:flex; flex-wrap:wrap; align-items:center; gap:10px;
          padding:8px 12px; background:#0b0f1a; color:#cbd5e1; font:600 12px/1.2 -apple-system,sans-serif;
          border-bottom:1px solid #1b2030; }
        .dev-bar .tag { color:#f59e0b; letter-spacing:.08em; }
        .dev-bar label { display:flex; align-items:center; gap:5px; color:#8b93a0; }
        .dev-bar select { background:#12151f; color:#f4f6fb; border:1px solid #2b3242; border-radius:6px; padding:3px 6px; font:inherit; }
        .dev-bar .wbtn { background:#12151f; color:#cbd5e1; border:1px solid #2b3242; border-radius:6px; padding:3px 8px; cursor:pointer; }
        .dev-bar .wbtn.on { background:#2f6bff; color:#fff; border-color:#2f6bff; }
        .dev-stage { flex:1; min-height:0; overflow:auto; display:flex; justify-content:center; padding:16px; }
        .dev-frame { flex:none; height:100%; border:1px solid #2b3242; border-radius:10px; overflow:hidden; box-shadow:0 20px 60px -30px #000; }
        .dev-frame .bc-panel { height:100%; }
      `}</style>

      <div className="dev-bar">
        <span className="tag">● DEV PREVIEW</span>
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
        <label>
          Width
          {WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              className={`wbtn${width === w ? " on" : ""}`}
              onClick={() => setWidth(w)}
            >
              {w}
            </button>
          ))}
        </label>
      </div>

      <div className="dev-stage">
        <div className="dev-frame" style={{ width }}>
          <PanelApp
            state={state}
            lead={state === "loaded" ? fixture.lead : null}
            nextActions={state === "loaded" ? fixture.nextActions : []}
          />
        </div>
      </div>
    </div>
  );
}
