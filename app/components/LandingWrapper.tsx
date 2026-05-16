"use client";

import { useLayoutEffect } from "react";

export default function LandingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
useLayoutEffect(() => {
    // Hide navbar
    const nav = document.querySelector("nav");
    if (nav) nav.style.display = "none";

    // Hide footer
    const footer = document.querySelector("footer");
    if (footer) footer.style.display = "none";

    // 🔥 Disable ANY popups / modals
    const modals = document.querySelectorAll('[role="dialog"], .modal, .popup');
    modals.forEach((el) => ((el as HTMLElement).style.display = "none"));

        // 🔥 Disable chat widgets if present
    const chat = document.querySelector("#chat-widget, .chat-widget");
    if (chat) (chat as HTMLElement).style.display = "none";

    // 🔥 Disable sticky mobile CTA buttons
    const stickyButtons = document.querySelectorAll(
      '.sticky-cta, .mobile-cta, .floating-cta, [class*="sticky"], [class*="floating"]'
    );

    stickyButtons.forEach((el) => {
      const htmlEl = el as HTMLElement;

      // Extra protection for fixed bottom buttons
      const styles = window.getComputedStyle(htmlEl);

      if (
        styles.position === "fixed" ||
        styles.bottom !== "auto"
      ) {
        htmlEl.style.display = "none";
      }
    });

    return () => {
      if (nav) nav.style.display = "";
      if (footer) footer.style.display = "";
    };
  }, []);

  return <>{children}</>;
}