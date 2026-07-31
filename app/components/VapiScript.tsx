"use client";

import Script from "next/script";

// Rendered only inside app/(lonestar)/layout.tsx. Its old excluded paths
// (/get-my-list, /second-chance-apartments) live in the separate (landing)
// group and never mount this component, so the exclusion is gone — structural.
export default function VapiScript() {
  return (
    <Script
      src="https://cdn.vapi.ai/widget.js"
      data-assistant-id="4122a3c1-d5dd-46ed-8217-e554280a2e98"
      data-mode="chat"
      strategy="afterInteractive"
    />
  );
}
