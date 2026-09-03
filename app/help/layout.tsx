import type { Metadata } from "next"
import { Inter } from "next/font/google"
import HelpChrome from "./_components/HelpChrome"
import "../locator-beast/beast.css"

// The Help Center reuses the Locator Beast marketing/product design system
// (beast.css tokens + .beast-container + PageHero), so it renders inside a
// `.beast-root` on the product's near-black ground — the same visual world as
// Beast Academy. The dark chrome + auth gate live in HelpChrome (client); this
// server layout only wires up the tokens, font, and dark surface.
const inter = Inter({
  subsets: ["latin"],
  variable: "--beast-font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Locator Beast Help Center",
  robots: { index: false, follow: false },
}

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`beast-root ${inter.variable}`}
      style={{ background: "var(--beast-bg-dark)", color: "var(--beast-ink-inverse)" }}
    >
      <HelpChrome>{children}</HelpChrome>
    </div>
  )
}
