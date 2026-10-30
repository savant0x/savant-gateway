# FID: Timestamps in the reader's timezone

**Filename:** `FID-2026-1030-040-local-time.md`
**ID:** FID-2026-1030-040
**Severity:** low
**Status:** closed
**Closed Against:** `50758c1`
**Archived:** 2026-10-30
**Final closure:** LocalTime and production account/admin/catalog callers exist
in source and Git; full `npm run verify` exit 0 this session. The correction
below describes the pre-commit state; earlier DOM observations remain historical.
**Created:** 2026-10-30 03:05
**Closed:** 2026-10-30 03:35
**Closure correction:** 2026-10-30 — implementation exists and fresh full
`npm run verify` exited 0. Historical closed labels below were premature:
implementation remains uncommitted; archive only after recording its real SHA.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one client component, one formatter swap, no
dependency, no new data, no timezone stored anywhere.

---

## Summary

Every timestamp on the product was printed in UTC: `formatDate` appended a
literal `" UTC"`, the admin usage and customer tables formatted with
`timeZone: "UTC"` to survive server rendering, and the catalog/compare footnotes
stamped the Artificial Analysis measurement and the OpenRouter fetch in UTC. A
reader in Salem read "05:58 UTC" for a measurement their own clock placed at
1:58 AM, and had to do the arithmetic to know when a key was last used or when
a grant ends. This FID makes those surfaces show the reader's
local time while keeping the server render and the hydrated tree identical.

## Environment

- **Stack:** Next.js 16 App Router (server components by default), Tailwind 4 +
  `styles/savant.css`
- **Surfaces:** `/account`, `/admin` (dashboard, customers, subscriptions,
  providers, benchmarks, credit), `/dashboard` cards, `/models` and `/compare`
  footnotes
- **Constraint:** the server has no idea where the reader is; the browser does.

## Detailed Description

### Problem

`components/dashboard/format.ts` exported `formatDate(value)`, which built an
`Intl.DateTimeFormat` pinned to `timeZone: "UTC"` and appended the literal
" UTC" to the output. Every timestamp in the app went through it, so the zone
was baked into the shared formatter. Components that formatted inline rather
than through the helper (the admin usage table, the admin customer and
subscription tables) passed `timeZone: "UTC"` explicitly for the same reason:
formatted on the server in the process's zone, then hydrated in the browser's,
the text would otherwise mismatch and React would warn.

Two footnotes made the same choice in prose — the AA measurement time on
`/models` and `/compare`, and the OpenRouter list fetch time beneath them.

### Expected Behavior

A timestamp renders in the viewer's own zone, with the zone named so the reader
can tell it is local; the exact instant stays available on the element; nothing
about the timezone is stored in the database; and no hydration mismatch is
introduced by rendering two different strings on the server and the client.

A date-only value is not a timestamp and must not be timezone-shifted:
`2026-09-22` is September 22 everywhere, and parsing it as midnight UTC would
show September 21 to anyone west of Greenwich.

### Root Cause

A single UTC-pinned formatter at the bottom of the UI tree, used for two
different kinds of value (instants and calendar days), forced the zone at the
wrong layer. The server cannot know the reader's zone, so the shared formatter
chose the one zone both sides agree on — and that choice leaked to the reader.

### Evidence

Before, from the rendered `/compare` footnote:

```text
AA Benchmark is ... (index v5.0), measured Oct 30, 05:58 UTC. ... List rates come
from OpenRouter's public model list, fetched Oct 30, 07:01 UTC.
```

After, same URL on the same data:

```text
AA Benchmark is ... (index v5.0), measured Oct 30, 1:58 AM EDT. ... List rates come
from OpenRouter's public model list, fetched Oct 30, 3:01 AM EDT.
```

The stored instants are unchanged; the browser is in `America/New_York`, and the
zone label follows it. The clock is 12-hour with an AM/PM marker on both sides
of the swap, because every reader of this page is reading a wall clock, not a
log file.

## Impact Assessment

### Affected Components

- `components/local-time.tsx` (new) — `LocalTime`, the one timestamp renderer
- `components/dashboard/format.ts` — `formatDate` (UTC, appends " UTC") replaced
  by `formatCalendarDay` (date-only, no zone, documents why it is never localised)
- Account: `components/account/billing-history.tsx`, `keys-card.tsx`,
  `subscription-card.tsx`, `app/account/page.tsx`
- Admin: `components/admin/admin-panel.tsx`, `benchmark-panel.tsx`,
  `credit-card.tsx`, `customers-table.tsx`, `providers-panel.tsx`,
  `subscriptions-panel.tsx`
- Dashboard: `components/dashboard/hero.tsx`, `keys-card.tsx`,
  `provider-card.tsx`, `usage-card.tsx`
- Catalog/compare: `components/catalog/catalog-footnote.tsx`, `app/compare/page.tsx`

### Risk Level

- [ ] Critical
- [ ] High
- [x] Low — display only; no stored value, query or billing boundary changed

## Proposed Solution

`LocalTime` is a client component that renders the UTC text on the server and
replaces it with the browser's zone after mount, so the first paint and the
hydrated tree agree and the swap happens once. It carries the ISO instant in
`datetime` and the original value in `title`, and falls back to the raw string
for anything unparseable.

Calendar days go the other way: `formatCalendarDay` keeps a date-only value in
its own frame and says so in a comment, so the next person does not "fix" it
into a timezone shift.

## Verification Receipt

```text
$ npx tsc --noEmit                    → exit 0
$ npx eslint <changed files>          → exit 0, no output
$ curl localhost:3000/{,models,compare}          → 200
$ curl localhost:3000/{admin,account}            → 307 (auth gate, expected)
$ DOM read /compare footnote (America/New_York)  → "1:58 AM EDT" / "3:01 AM EDT"
$ SSR HTML before hydration                      → "5:58 AM UTC" / "7:01 AM UTC"
$ grep -rn "UTC" components app --include=*.tsx  → only components/local-time.tsx
  and the two deliberate "resets per UTC day" lines (gateway settings, admin
  gateway page) and the analytics chart caption
```

Limitations, stated rather than papered over: `/admin` and `/account` sit behind
auth, so their tables were typechecked and linted but not re-rendered in this
pass; the identity used in the check was not available to the harness.

## Perfection Loop

### Loop 1 — RED

The rendered footnote on `/compare` carried "05:58 UTC" and "07:01 UTC" while
the browser was in `America/New_York` and its own clock showed 1:58 AM — the
defect, reproduced in the DOM rather than inferred from the source.

### GREEN → AUDIT → SELF-CORRECT

`LocalTime` added, the 14 timestamp call sites moved to it, `formatDate` deleted.
Audit of the result found three survivors the first sweep missed:

1. `components/admin/admin-panel.tsx` formatted the usage table's "Time" column
   inline with `timeZone: "UTC"`.
2. `app/account/page.tsx` sliced `new Date(customer.createdAt).toISOString()` to
   ten characters for the join date — a UTC calendar day derived by hand, which
   is fine as a date but the wrong function; it now calls `formatCalendarDay`.
3. The footnote copy itself still said "UTC" for both stamps.

A second `grep` for `UTC`, `toISOString` and `toLocaleString` across
`components` and `app` then returned only the component, the deliberate UTC-day
copy, and unrelated number formatting.

### Convergence

Two loops. Every `UTC` string left in the tree is a statement about a billing
boundary (the free pool resets per UTC day) rather than a timestamp, and a local
label there would describe a different boundary than the one enforced, so those
stay as they are.

## Resolution

Closed against the working tree at `2026-10-30 03:35`; no commit yet (the
session's changes are uncommitted alongside the compare feature they touch).

## Lessons Learned

The server's clock is not the reader's clock, and a formatter shared by both is
the wrong place to decide. Render the one zone both sides can compute, then let
the browser correct it once — and keep date-only values out of that path
entirely. Recorded in `dev/LEARNINGS.md`.
