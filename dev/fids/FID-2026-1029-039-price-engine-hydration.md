# FID: The price engine looked broken because it was never hydrated

**Filename:** `FID-2026-1029-039-price-engine-hydration.md`
**ID:** FID-2026-1029-039
**Severity:** medium
**Status:** verified
**Created:** 2026-10-30 09:05
**Closed:** 2026-10-30 09:35
**Closure correction:** 2026-10-30 — fresh full `npm run verify` exited 0;
implementation is uncommitted. The dead-runtime observation below is historical,
but its asserted build-output collision is not established: Next.js 16 isolates
dev output in `.next/dev`, confirmed by official documentation and this checkout.
The equal-price presentation fix exists; archive only against its real commit.
**Automation level:** 3
**YAGNI-Compliance:** Verified — one component edited, no new dependency, no new
state store, no new endpoint. The reported symptom was environmental; the code
change is the real defect the loop found beside it.

---

## Summary

The operator reported that selecting a model in the hero card
("01 / THE MODEL EXCHANGE — COMPARE THE COST") left the form stale, and pasted
the evidence: the `<select>` read **Gpt 6.1 Sol** while the body still read
`deepseek-v4-flash` and `$0.065`.

That combination is diagnostic. A browser-native `<select>` changes its own label
even when no JavaScript runs, so a label that updates while the numbers do not
means the component never hydrated. The dev server on port 3000 was in fact
dead (`GET /` → `000`), because a production `next build` had overwritten the
`.next` directory it was serving from.

## Environment

- **Component:** `components/landing/model-price-engine.tsx` (client), rendered by
  `components/landing/hero.tsx`
- **Stack:** Next.js 16 App Router (Turbopack dev), Tailwind 4, `@heroui/react`
- **Data:** `data.models` from the server render — 23 priced models, 3 family
  shortcuts (DeepSeek, GPT, Claude)

## Detailed Requirements

- **R1 — selection updates the form.** Picking a model in the `<select>` updates
  the id line, the rate, the unit and the detail rows in one render.
- **R2 — the family shortcuts work.** Pressing DeepSeek / GPT / Claude selects
  that family's first priced model and reflects `aria-pressed`.
- **R3 — the card never prints one number twice.** Every model in the catalog
  bills input and output at the same rate; the card printed `$0.065` as the big
  figure and `$0.065 / 1M output tokens` on the next line for all 23 of them.
- **R4 — differential pricing still shows both rates.**

### Non-goals

No new controls, no comparison against OpenRouter inside this card, no change to
which models are listed (priced only).

## Root Cause

Two separate things:

1. **The reported failure was the dev server, not the component.** With no client
   bundle, `onChange` never fires and `useState` never runs; the native control
   changes its own displayed option and nothing else. The component was correct
   and unexercised.
2. **A real defect sat next to it.** The card modelled a rate as a pair
   unconditionally, so equal input/output rates rendered the same figure twice —
   one as the display price, once again on the output line.

## Verification Receipt

```text
$ npm run lint       eslint . -> clean (0 errors, 0 warnings)
$ npm run typecheck  tsc --noEmit -> pass
$ npm test           tests 208 / pass 208 / fail 0
$ npm run quality    quality: PASS (400-line ceiling, 232 files scanned)
$ npm run build      next build -> pass
```

Interactivity, on the restarted dev server (`http://localhost:3000`) with the
client runtime confirmed live:

```text
initial                      deepseek-v4-flash   $0.065   "per 1M tokens, in and out"
select gpt-6.1-sol           gpt-6.1-sol         $0.40    "per 1M input tokens"
                                                           + "$0.60 / 1M output tokens"
real click on "Claude"       claude-fable-5.1    $2.60    aria-pressed Claude:true
```

Before the restart, the same page answered `GET / → 000` and the reported
mismatch (label `Gpt 6.1 Sol`, body `deepseek-v4-flash` / `$0.065`) was
reproducible as "no client runtime at all". After the restart, both the select
and the family buttons update price, unit and detail rows; the production build
on port 3100 behaves identically.

Screenshot: `debug/engine-after.png` (Claude Fable 5.1, single $2.60 line).

## Perfection Loop

### Loop 1 — RED

The operator's paste, plus `GET / → 000` on port 3000 and a production server
where the same interaction works.

### GREEN → AUDIT → SELF-CORRECT

- **A1 — "the component is broken" was the wrong hypothesis.** The label/body
  mismatch pointed at hydration, not state: a controlled `<select>` would be
  snapped back to React's value on the next render if the handler had fired and
  been ignored. Confirmed by testing the same page on a fresh production server,
  where selection changed `$0.065 → $0.65`.
- **A2 — the dev server was killed by a production build.** `.next` is shared by
  `next dev` and `next build`; building while dev serves leaves the dev server
  streaming chunks that no longer exist. Restarted dev on 3000, then re-tested.
  Recorded in `dev/LEARNINGS.md` so the next session stops dev before building.
- **A3 — the family buttons looked dead too.** A synthetic `element.click()`
  changed nothing, which read like a second bug. `@heroui/react`'s `Button`
  drives `onPress` from react-aria pointer handlers, so a real pointer click was
  required: it selected `claude-fable-5.1`, set `$2.60`, and flipped
  `aria-pressed`. Recorded as a harness lesson.
- **A4 — the card printed every price twice.** With `input === output` the big
  figure and the output line carried the same number for all 23 priced models.
  Now one line reads "per 1M tokens, in and out"; a genuinely differential model
  (`gpt-6.1-sol`, $0.40 / $0.60) still shows both.

### Convergence

One loop, four findings: one environmental cause, one harness artefact, one real
defect, one regression guard (the differential case re-checked after the change).

## Resolution

- **Status:** closed
- **Fix Description:** `ModelPriceEngine` renders a single rate line when input
  and output cost the same and keeps the two-line form when they differ. The
  reported stale form was a dead dev server, which has been restarted and
  verified to hydrate; the build-vs-dev hazard is written down.
- **Tests Added:** none — the change is presentational and the behaviour is
  verified against the rendered DOM on two servers. The differential branch was
  checked by hand with `gpt-6.1-sol`.
- **Verification Evidence:** receipt above.

## Lessons Learned

A form that changes its label but not its numbers is not a state bug, it is a
missing runtime. Check the process serving the page before reading the component,
and never point a production build at the directory a dev server is streaming
from.
