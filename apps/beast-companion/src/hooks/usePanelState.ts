import { useCallback, useEffect, useState } from "react";
import { getPanelState, onPanelStateChanged, setPanelState } from "@/services/storage";
import { onRuntimeMessage } from "@/services/messaging";
import type { PanelState } from "@/types";

/**
 * Owns the open/closed state of the companion and keeps it in sync across:
 *  - the docked tab + the panel's close button (local toggles),
 *  - the toolbar action click (a TOGGLE_PANEL runtime message),
 *  - other tabs on the same site (chrome.storage change events).
 *
 * The persisted value is what lets us "remember the open/closed state for that
 * user" between page loads.
 */
export function usePanelState() {
  const [state, setState] = useState<PanelState>("closed");

  // Hydrate from storage on mount.
  useEffect(() => {
    let active = true;
    void getPanelState().then((s) => {
      if (active) setState(s);
    });
    return () => {
      active = false;
    };
  }, []);

  // Persist + broadcast whenever state changes.
  const apply = useCallback((next: PanelState) => {
    setState(next);
    void setPanelState(next);
  }, []);

  const open = useCallback(() => apply("open"), [apply]);
  const close = useCallback(() => apply("closed"), [apply]);
  const toggle = useCallback(
    () => setState((s) => {
      const next: PanelState = s === "open" ? "closed" : "open";
      void setPanelState(next);
      return next;
    }),
    [],
  );

  // React to changes from other contexts (storage) and the toolbar (messages).
  useEffect(() => {
    const offStorage = onPanelStateChanged((s) => setState(s));
    const offMessage = onRuntimeMessage((msg) => {
      if (msg.type === "TOGGLE_PANEL") toggle();
    });
    return () => {
      offStorage();
      offMessage();
    };
  }, [toggle]);

  return { isOpen: state === "open", open, close, toggle };
}
