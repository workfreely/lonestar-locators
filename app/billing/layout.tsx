import { Inter } from "next/font/google";
import "../locator-beast/beast.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export const metadata = {
  title: "Billing | Locator Beast",
  robots: { index: false, follow: false },
};

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`beast-root ${inter.variable}`}>{children}</div>;
}
