import { Inter } from "next/font/google";
import "./beast.css";

// Shared shell for everything under the Locator Beast host: the beast-root
// design-token scope + the Inter brand font. It renders NO marketing chrome.
//
// Chrome ownership is structural (see app/layout.tsx): the marketing Nav/Footer/
// Ask-Beast-AI live in the (site) route group's layout, which wraps only the
// marketing pages. The public per-agent Smart Form at [username] is a sibling of
// (site), so it inherits ONLY this bare shell — it renders as a completely
// standalone landing page with no website navigation, footer, or marketing UI.

const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
});

export default function LocatorBeastLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className={`beast-root ${inter.variable}`}>{children}</div>;
}
