import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
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
      className={`beast-root ${inter.variable} items-center justify-center px-4 py-12`}
      style={{ backgroundColor: "#f7f8fa" }}
    >
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        {/* The black lion mark — the login card sits on #f7f8fa, so the
            black-on-transparent artwork is the readable one here. Referenced
            directly rather than through LOGO_FOR_LIGHT_BG, which Billing also
            uses and which is out of scope for this checkpoint. */}
        <Image
          src="/locator-beast/locator-beast-favicon-black.png"
          alt="Locator Beast"
          width={512}
          height={512}
          priority
          style={{ height: "80px", width: "80px" }}
          className="mb-10"
        />
        {children}
      </div>
    </div>
  );
}
