import { useEffect, useState } from "react";
import { PanelApp } from "./PanelApp";
import { DISCONNECTED, type CompanionConnection } from "./connection";

/**
 * Production side-panel wrapper. Connection status is derived EXCLUSIVELY from
 * the background service worker's authenticated state — never hard-coded and
 * never fixture-derived. The panel asks the SW for status and subscribes to SW
 * pushes; the SW sends ONLY { status, name, workspace } over internal extension
 * messaging and NEVER a token (safeguard #3). Until the SW reports a verified
 * "connected", the panel stays disconnected → "Not connected".
 *
 * The SW message handlers (get-status / start-connect / disconnect / status
 * push) are wired as the extension auth client + background onMessageExternal
 * land; until then get-status simply doesn't resolve and the panel correctly
 * shows Not connected.
 */
export function ProductionPanel() {
  const [connection, setConnection] = useState<CompanionConnection>(DISCONNECTED);

  useEffect(() => {
    const rt = (globalThis as unknown as { chrome?: any }).chrome?.runtime;
    if (!rt?.sendMessage) return;

    // Ask the SW for the current authenticated status.
    try {
      rt.sendMessage({ type: "companion:get-status" }, (resp: { connection?: CompanionConnection } | undefined) => {
        if (rt.lastError) return; // SW not ready / no handler yet → stay disconnected
        if (resp?.connection) setConnection(resp.connection);
      });
    } catch {
      /* messaging unavailable — remain disconnected */
    }

    // Subscribe to SW-pushed status changes (auth gained/lost). Never a token.
    const onMsg = (msg: { type?: string; connection?: CompanionConnection }) => {
      if (msg?.type === "companion:status" && msg.connection) setConnection(msg.connection);
    };
    rt.onMessage?.addListener(onMsg);
    return () => rt.onMessage?.removeListener(onMsg);
  }, []);

  const rt = () => (globalThis as unknown as { chrome?: any }).chrome?.runtime;
  const onConnect = () => rt()?.sendMessage?.({ type: "companion:start-connect" });
  const onDisconnect = () => {
    rt()?.sendMessage?.({ type: "companion:disconnect" });
    setConnection(DISCONNECTED); // optimistic; the SW confirms via a status push
  };

  return <PanelApp connection={connection} onConnect={onConnect} onDisconnect={onDisconnect} />;
}
