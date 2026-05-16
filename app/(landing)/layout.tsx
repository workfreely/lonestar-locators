"use client";

import { useLayoutEffect } from "react";

export default function LandingWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  useLayoutEffect(() => {
    const nav = document.querySelector("nav");
    const footer = document.querySelector("footer");

    if (nav) nav.style.display = "none";
    if (footer) footer.style.display = "none";

    return () => {
      if (nav) nav.style.display = "";
      if (footer) footer.style.display = "";
    };
  }, []);

  return <>{children}</>;
}