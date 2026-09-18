import type { Metadata } from "next";
import { Inter } from "next/font/google";
import LocatorBeastWordmark from "@/components/brand/LocatorBeastWordmark";
import "../locator-beast/beast.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Locator Beast",
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`beast-root beast-glow ${inter.variable} items-center justify-center px-4 py-12`}
      style={{ backgroundColor: "var(--beast-bg-dark)" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        {/* The full white wordmark — this layout is shared by /login and
            /signup, so both surfaces change from here rather than page by page.
            The dark ground (--beast-bg-dark, the product's near-black) matches
            the CRM branding, so the white-on-transparent artwork is the readable
            one; the white card + light fields sit on top. 40px is restrained
            enough not to compete with the form's 26px heading while staying
            clearly legible. Centering is unchanged: the parent is already flex +
            items-center. */}
        <LocatorBeastWordmark variant="white" height={40} priority className="mb-4" />
        {children}
      </div>
    </div>
  );
}
