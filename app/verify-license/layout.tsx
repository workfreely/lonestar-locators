import { Inter } from "next/font/google";
import "../locator-beast/beast.css";
import AskBeastAI from "@/components/beast-ai/AskBeastAI";

// Mirrors app/billing/layout.tsx exactly. /verify-license is the licence analogue of
// /billing: a top-level authenticated destination that explains one unmet requirement
// and lets the user resolve it. Same shell, same tokens, no new visual language.
const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export const metadata = {
  title: "License Verification | Locator Beast",
  robots: { index: false, follow: false },
};

export default function VerifyLicenseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`beast-root ${inter.variable}`}>
      {children}
      <AskBeastAI />
    </div>
  );
}
