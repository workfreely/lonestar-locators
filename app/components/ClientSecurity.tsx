"use client";

import { useEffect } from "react";

/**
 * 🔒 Client-side friction protection
 * - Disables right-click
 * - Disables text selection
 * - Does NOT affect forms or inputs
 * - Safe to remove anytime
 */
export default function ClientSecurity() {
  useEffect(() => {
    const blockContextMenu = (e: MouseEvent) => {
      // Allow right-click inside inputs / textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }
      e.preventDefault();
    };

    const blockSelection = (e: Event) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }
      e.preventDefault();
    };

    document.addEventListener("contextmenu", blockContextMenu);
    document.addEventListener("selectstart", blockSelection);

    return () => {
      document.removeEventListener("contextmenu", blockContextMenu);
      document.removeEventListener("selectstart", blockSelection);
    };
  }, []);

  return null;
}
