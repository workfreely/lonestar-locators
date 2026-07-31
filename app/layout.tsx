import "./globals.css";
import { ANTI_FLASH_THEME_SCRIPT } from "@/lib/theme";

// Brand-NEUTRAL root layout. It contains only truly-global concerns: the
// document shell, global CSS, and the CRM theme anti-flash init. It renders NO
// navigation, NO footer, and makes NO Locator-Beast-vs-Lone-Star decision.
//
// Brand chrome is owned structurally by each route's own layout:
//   • Lone Star marketing → app/(lonestar)/layout.tsx
//   • Locator Beast marketing → app/locator-beast/layout.tsx
//   • LB auth → app/(auth)/layout.tsx   • onboarding → app/onboarding/layout.tsx
//   • LB app/CRM → app/admin/layout.tsx • billing/smart-lead-form → their layouts
//
// Because Lone Star chrome lives only inside (lonestar), a Locator Beast page
// cannot inherit it. No middleware header, runtime check, or pathname list is
// involved in layout selection.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* CRM theme anti-flash — applies the saved light/dark preference to
            <html> before paint. Harmless on marketing pages (they never
            reference the CRM theme tokens). Kept global so the CRM avoids a
            flash regardless of which layout renders. */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
