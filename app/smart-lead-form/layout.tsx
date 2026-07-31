import { Inter } from "next/font/google";
import "../locator-beast/beast.css";
import AskBeastAI from "@/components/beast-ai/AskBeastAI";

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export const metadata = {
  title: "Smart Lead Form | Locator Beast",
  robots: { index: false, follow: false },
};

export default function SmartLeadFormLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`beast-root ${inter.variable}`}>
      {children}
      <AskBeastAI />
    </div>
  );
}
