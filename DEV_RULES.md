# DEV_RULES.md
Lone Star Locators — Development Rules & Guardrails

This file exists to prevent accidental breakage, build failures,
and architectural drift in the Next.js App Router project.

READ THIS BEFORE EDITING ROUTES OR COMPONENTS.

---

## 🧠 CORE PRINCIPLES

1. **Never delete a route unless it is confirmed unused AND documented**
2. **Prefer disabling (commenting) over deleting**
3. **Always inspect existing code before replacing**
4. **Build errors are signals, not emergencies**
5. **One change at a time — then test**

---

## 🧩 NEXT.JS APP ROUTER RULES

### Page Components
- `page.tsx` files are **Server Components by default**
- Do NOT mark a page `async` if it has `"use client"`
- Client components must NOT be async

✅ Correct:
```ts
export default function Page() {}
