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
