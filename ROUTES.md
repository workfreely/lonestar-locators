# ROUTES.md
Lone Star Locators — Route Registry

This file documents all application routes, their purpose,
and whether they are active, disabled, or planned.

---

## 🟢 LIVE ROUTES (Production)

### Home
- `/`
- Source: Static / components
- Status: Live

### City Apartment Listings
- `/austin/apartments`
- `/dallas/apartments`
- `/houston/apartments`
- `/san-antonio/apartments`
- Source: Supabase (`properties` table)
- Status: Live

### Apartment Detail Pages
- `/:city/apartments/:slug`
- Example: `/san-antonio/apartments/alaro-luxury-villas`
- Source: Supabase
- Status: Live

### Apartment Reviews (City Index)
- `/san-antonio/apartments/reviews`
- `/austin/apartments/reviews`
- Source: Component-based
- Status: Live

---

## 🟡 TEMP / HYBRID ROUTES

### Individual Review Pages
- `/:city/apartments/reviews/:slug`
- Current State:
  - Temporarily hardcoded (e.g. Alaro Luxury Villas)
  - Will be migrated to Supabase later
- Status: Partially Live

---

## 🔴 DISABLED / FUTURE ROUTES (DO NOT DELETE)

### City Category Pages
- `/:city/:category`
- Examples:
  - `/san-antonio/luxury-apartments`
  - `/austin/penthouses`
- Purpose:
  - Future SEO category pages
- Current State:
  - File exists
  - Route stubbed (returns null)
  - Full implementation commented out
- Status: Disabled (intentional)

---

## 🔵 LEGACY / CLEANUP CANDIDATES

### Old Hardcoded Blog Pages
- `/blog/*` (older static entries)
- Source: Hardcoded
- Notes:
  - To be replaced by Supabase blog import
- Status: Deprecated (safe to remove after migration)

---

## 🛑 IMPORTANT RULES

- Do NOT delete routes marked “Disabled”
- Disabled routes should:
  - Export a stub page
  - Preserve original logic in comments
- Any new route must be added here
- Before deleting a page, check this file

---

Last updated: 2026-01-15
