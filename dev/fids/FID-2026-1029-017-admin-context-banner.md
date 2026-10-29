# FID: Operator-editable context banner

**Filename:** `FID-2026-1029-017-admin-context-banner.md`
**ID:** FID-2026-1029-017
**Severity:** medium
**Status:** verified
**Created:** 2026-10-29 18:20
**Automation level:** 3
**YAGNI-Compliance:** Verified — one settings pair, one injection point, no
templating engine and no per-model variants.

> **Sequencing disclosure.** Implementation and design landed in the same pass
> at the operator's direction. The record reflects the code that exists.

---

## Summary

Add an operator-editable string that is prepended as a system message to every
upstream chat request while enabled. The operator intends to run a short
promotion for their other product inside the context window of agents that use
the gateway. The text is stored in `settings`, edited from a new Admin → Gateway
page, validated to 2,000 characters, and counted in the request's prompt-token
estimate so free allocations and credit holds account for it.

## Environment

- **OS:** Windows 11, Node v24.21.0
- **Language/Runtime:** TypeScript strict, Next.js 16, SQLite
- **Commit/State:** `16e431f` at start

## Detailed Description

### Problem

There is no operator-controlled text injection point. Any message the operator
wants every agent to see would require a code change and a deploy.

### Expected Behavior

- One string, edited in the dashboard, with an enable switch.
- Present in `messages` as a leading `system` message on every upstream call
  when enabled.
- Works for both OpenAI Chat Completions and Anthropic Messages upstreams
  (the translator already folds system messages into `system`).
- Never injected into a client response; never persisted per request.
- Its tokens are accounted for before admission.

### Root Cause

No product surface for global prompt text existed; request payloads were
forwarded unchanged.

### Evidence

```text
16e431f  lib/gateway.ts  payload = { ...body, model }  (no injection point)
         lib/store/settings.ts  generic key/value settings table exists
```

## Impact Assessment

### Affected Components

- `lib/context-banner.ts` (new, validation and message shaping)
- `lib/store/banner.ts` (new, settings read/write)
- `lib/gateway.ts` (prompt-token accounting and payload injection)
- `app/api/admin/gateway/route.ts`, `components/admin/gateway-settings.tsx`,
  `app/admin/(panel)/gateway/page.tsx`

### Risk Level

- [x] Medium: it changes every upstream request while enabled and consumes
  upstream tokens.

## Proposed Solution

### Approach

`normalizeBannerText` collapses CRLF, removes control characters except tab and
newline, and trims. `validateBannerText` enforces the 2,000-character cap and
rejects non-strings. `withContextBanner` returns a new array with one leading
`{ role: "system", content }` message and never mutates the caller's array.

In `handleChatCompletions`, the banner is resolved once after model/provider
validation. `estimateTokensFromText(bannerText)` is added to the prompt-token
estimate used by the subscription estimate, the free allocation, and the paid
hold. The payload's `messages` is replaced only when a banner is active.

### Steps

1. Pure validation and message shaping with tests. — implemented
2. Settings-backed read/write. — implemented
3. Gateway accounting and injection. — implemented
4. Admin API and form with length feedback. — implemented

### Verification

`tests/context-banner.test.mjs` (3 cases) covers normalization, rejection, the
cap, and non-mutation of the caller's array. Live injection is verified by the
existing HTTP suite's gateway path only if a banner is enabled; the default is
empty and disabled, so the suite proves no regression rather than banner
delivery.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/context-banner.test.mjs
- gate: quality
- gate: build

### Verification Receipt

- verified: 2026-10-29
- lint: exit 0, zero warnings
- typecheck: exit 0
- test: 133 tests, 133 pass, 0 fail (includes 3 banner cases)
- quality: exit 0, PASS over 207 files
- build: exit 0, `/admin/gateway` and `/api/admin/gateway` compiled

## Perfection Loop

### Loop 1 — RED

- **RED:** No injection point; no accounting for injected tokens.
- **GREEN:** Pure banner module, settings store, gateway accounting.
- **AUDIT:** `withContextBanner` is called only when `bannerText` is non-empty;
  `payload.messages` is the only field replaced; `body` is not mutated.
- **ADVERSARIAL:** Two system messages are legal for OpenAI and are joined by the
  Anthropic translator, so an existing customer system prompt is preserved.
- **CHANGE DELTA:** n/a.

### Missed Questions

1. Who pays for the banner's tokens? → The request's usage does, because the
   upstream bills them. The admin copy states this; no silent discounting.
2. What if the banner makes the request exceed the model context? → The upstream
   rejects it. The gateway does not silently truncate customer content.
3. Does it apply to streaming? → Yes; the same payload is used for both paths.
4. Is it visible in responses? → No; it is request-only.

### Implementation Evidence (REQUIRED for `closed`)

- [x] Commit SHA: recorded at closure
- [x] File:line ranges: `lib/context-banner.ts`, `lib/store/banner.ts`,
  `lib/gateway.ts` (banner block and payload injection)
- [x] Gate output: Verification Receipt
- [x] Reproducibility: `grep -rn "withContextBanner" lib` finds the definition
  and the gateway call
- [x] Step statuses: all four `implemented`

### Code Verification Evidence

- [x] Files exist
- [x] Implementation matches the Proposed Solution
- [x] Gates pass
- [x] Call graph: `handleChatCompletions` → `getBannerConfig` →
  `withContextBanner` → `callProvider`
- [x] Status reflects the tree

### Loop 2 — Independent audit and self-correction

- **RED:** First draft computed prompt tokens before the banner existed, so a
  free hold under-estimated by the banner size.
- **GREEN:** Banner tokens are resolved before reservation and added to every
  prompt-token estimate.
- **AUDIT:** `grep -n "bannerTokens" lib/gateway.ts` shows the estimate and the
  paid reservation argument.
- **ADVERSARIAL:** An operator can enable an empty banner; `bannerText` is empty,
  so no message is injected and no tokens are added.
- **CHANGE DELTA:** ~3%.

### Loop 3 — Final convergence

- **RED:** Whitespace-only banners.
- **GREEN:** Normalization trims, and `withContextBanner` returns the original
  array for an empty result.
- **AUDIT:** Unit case asserts identity for whitespace.
- **ADVERSARIAL:** A 2,000-character banner is roughly 500 tokens at 4
  characters/token; the admin copy and the estimate make that visible.
- **CHANGE DELTA:** 0%.

## Resolution

- **Closed Date:** pending closure commit
- **Fix Description:** Settings-backed context banner with admin editing,
  validation, token accounting, and both-protocol injection.
- **Tests Added:** Yes — `tests/context-banner.test.mjs`.
- **Verification Evidence:** Verification Receipt above.
- **Archived:** pending closure commit

## Lessons Learned

Any text the gateway adds to a request is billable input. It must be accounted
for before admission, not after settlement, or the customer's allowance and the
operator's cost estimate disagree.
