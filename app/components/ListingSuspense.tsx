"use client";

import { Suspense } from "react";

export default function ListingSuspense({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div style={{ padding: "2rem" }}>Loading…</div>}>
      {children}
    </Suspense>
  );
}
