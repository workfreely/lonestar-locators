# `toISOString().split("T")[0]` — a date that can move by a day

**Status: documented, NOT changed.** Nothing in the move-in-date release touches this. It is
recorded here so the next person meets it on purpose rather than by surprise.

## What it is

Several places serialise a picked calendar day like this:

```ts
moveDate: date ? date.toISOString().split("T")[0] : ""
```

`toISOString()` converts to **UTC first**. A `Date` built from a local calendar day is local
midnight, so for anyone at a **positive** UTC offset that instant is still the *previous* day in
UTC, and the stored string is one day early.

| Picker shows | Browser timezone | Stored |
|---|---|---|
| 15 Nov 2026 | America/Chicago (UTC−6) | `2026-11-15` ✓ |
| 15 Nov 2026 | Europe/London (UTC+0, GMT) | `2026-11-15` ✓ |
| 15 Nov 2026 | **Asia/Manila (UTC+8)** | **`2026-11-14`** ✗ |
| 15 Nov 2026 | **Australia/Sydney (UTC+11)** | **`2026-11-14`** ✗ |

The same applies in reverse when a stored `"YYYY-MM-DD"` is read back with `new Date(value)`,
which parses as **UTC midnight** and then renders in local time — showing the previous day for
anyone at a negative offset.

## Where it occurs

| File | What it does | Risk today |
|---|---|---|
| `components/LeadFields.tsx:302` | CRM Edit/Add Client writes `move_date` | A locator east of UTC saves the day before |
| `app/components/LandingForm.tsx` | marketing form writes `moveDate` | Same, for the renter |
| `app/components/ContactForm.tsx` | marketing form writes `moveDate` | Same |
| `app/components/NewHomeContactForm.tsx` | marketing form writes `moveDate` | Same |
| the three above, `selected={new Date(formData.moveDate)}` | reads it back as UTC midnight | Can display the day before for a negative offset |

**Not affected:** the public Smart Lead Form, which already uses local-parts helpers
(`parseLocalDate` / `formatLocalYMD`) and says why in its own comment; and
`lib/leads/leadFormValues.ts`, which anchors to local noon deliberately.

## Why it was left alone

Every locator on the system today is in US Central, where the offset is negative and the write
path is correct — so there is no evidence of a wrong date in production from this cause, and the
move-in-date release had a specific, evidenced job to do. Changing serialisation also changes what
gets stored for every future submission on four forms at once, which deserves its own change with
its own verification rather than riding along.

## What a fix would look like

`lib/leads/moveDate.ts` already exports the two halves, written for exactly this and used by the
bounds check:

```ts
toLocalYMD(date)      // Date  → "YYYY-MM-DD", from LOCAL parts
parseLocalYMD(value)  // "YYYY-MM-DD" → local-midnight Date, or null
```

Replacing each `toISOString().split("T")[0]` with `toLocalYMD(date)` and each
`new Date(formData.moveDate)` with `parseLocalYMD(formData.moveDate)` is the whole change.

**Before doing it, check the workflows that read `move_date`** — guest cards, the invoice and
lease flows, follow-up templates, the Companion's Search Criteria row, and anything that compares
a move date with today. A fix makes stored dates *more* correct, but any code that currently
compensates for the shift would then be wrong by a day in the other direction.
