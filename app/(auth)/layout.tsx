import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Image from "next/image";
import "../locator-beast/beast.css";
import { LOGO_FOR_LIGHT_BG } from "../locator-beast/_lib/site";

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
        <Image
          src={LOGO_FOR_LIGHT_BG}
          alt="Locator Beast"
          width={172}
          height={40}
          style={{ height: "28px", width: "auto" }}
          className="mb-10"
        />
        {children}
      </div>
    </div>
  );
}
