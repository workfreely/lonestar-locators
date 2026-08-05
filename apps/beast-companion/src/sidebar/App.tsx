import { useEffect } from "react";
import { usePanelState } from "@/hooks/usePanelState";
import { CollapsedTab } from "./CollapsedTab";
import { Panel } from "./Panel";
import { closeLayout, openLayout } from "@/content/pageShift";

/**
 * Root of the Shadow-DOM UI. Owns nothing but wiring:
 *  - reads open/closed state from usePanelState,
 *  - drives the host page-shift as that state changes,
 *  - renders the docked tab and the sliding panel.
 *
 * Both the tab and the panel are always mounted; CSS handles show/hide and the
 * slide so the animation runs in both directions.
 */
export default function App() {
  const { isOpen, open, close } = usePanelState();

  // The single bridge between the isolated UI and the isolated layout controller.
  useEffect(() => {
    if (isOpen) openLayout("push");
    else closeLayout();
  }, [isOpen]);

  return (
    <div className={`bc-shell ${isOpen ? "is-open" : "is-closed"}`}>
      <CollapsedTab onOpen={open} />
      <Panel onClose={close} />
    </div>
  );
}
