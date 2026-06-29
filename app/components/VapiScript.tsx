"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

const EXCLUDED = ["/get-my-list", "/second-chance-apartments"];

export default function VapiScript() {
  const pathname = usePathname();
  if (EXCLUDED.some((p) => pathname.startsWith(p))) return null;

  return (
    <Script
      src="https://cdn.vapi.ai/widget.js"
      data-assistant-id="4122a3c1-d5dd-46ed-8217-e554280a2e98"
      data-mode="chat"
      strategy="afterInteractive"
    />
  );
}
