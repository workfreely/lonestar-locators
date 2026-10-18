import type { Config } from "tailwindcss";

export default {
  // Class-based so the CRM's own ThemeProvider (lib/theme.ts) controls
  // dark mode explicitly via a `.dark` class on <html> — supports the
  // Light/Dark/System picker (System still resolves to an explicit class,
  // it just decides which one from prefers-color-scheme). The marketing
  // site never adds this class, so `dark:` utilities only ever activate
  // inside the CRM.
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // `lib` IS scanned, because class names live there now. lib/social/accountCapabilities.ts
    // holds the Accounts page's status palette so the page and its preview harness cannot drift;
    // with lib outside these globs Tailwind never saw those strings and silently emitted no rule
    // for bg-yellow-500, text-sky-600 or any of the orange utilities. The class still reached the
    // HTML, so nothing threw — the badges just rendered with no colour. A utility that is only
    // ever referenced from a non-scanned file fails exactly this quietly.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
} satisfies Config;
