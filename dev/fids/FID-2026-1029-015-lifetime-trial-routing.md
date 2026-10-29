# FID: Lifetime trial ledger and paid routing

**Filename:** `FID-2026-1029-015-lifetime-trial-routing.md`
**ID:** FID-2026-1029-015
**Severity:** high
**Status:** converged
**Created:** 2026-10-29
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Implement the resumed one-time trial flow as disabled-by-default infrastructure.
The grant amount is configurable (100,000 development default); production
activation remains an operator decision, not implied by implementing the flow.

## Environment

Windows, strict TypeScript, SQLite, Next.js 16; base `466f649`.

## Detailed Description

### Problem / Expected Behavior

Current free admission renews per-user allowances daily. Customers instead need
one lifetime grant shared across keys, followed by an explicitly configured paid
counterpart under the same requested public id. Existing paid/subscription
behavior must remain intact when trials are disabled.

### Root cause / Evidence

`reserveFreeCall` reads free_pool_usage by user/day. The gateway's free branch
never resolves a paid counterpart. The prior launch contract establishes the
desired grant, reservation, settlement and pairing invariants.

## Impact Assessment

### Affected Components

Additive trial schema and injectable ledger; server-only routing wrapper; free
admission, usage settlement, gateway dispatch, customer account and model API.
Trial configuration and documentation. No live credential or funding changes.

### Risk Level

- [x] High: entitlement, concurrent accounting and credit routing.

## Proposed Solution

1. Add immutable per-user grants and durable reservation/settlement rows. Unique
   reservation ids make settlement replay a no-op. Retain expired rows so late
   usage is counted. Existing recorded free usage reduces the first grant;
   changing config or minting keys cannot renew it. Require verified email and
   an explicit finite gateway acquisition-grant budget for issuance.
2. Integrate grant reservation inside the existing immediate free-pool
   transaction. Trial admission also checks fresh known provider capacity and
   estimated usage plus safety reserve. If grant cannot cover the whole call,
   resolve only an explicit same-provider, enabled, in-catalog paid counterpart
   with known costs and positive retail prices. No capacity-triggered charging.
3. Reuse paid holds and settlement for funded calls. Persist requested public
   id and actual serving upstream id independently. Trial debits settle in the
   same transaction as usage and free reservation release; preserve JSON/SSE
   settlement. Existing subscription resolution has precedence.
4. Show lifetime trial balances and transition rates in account UI; add model
   API trial metadata without changing existing fields. Keep flag off, pair map
   empty and acquisition budget zero by default. No public trial marketing.
5. Add `tests/trials.test.mjs` for config, unique issuance, budgets, verification,
   multiple holds, day independence, historical usage, expiry, late settlement,
   replay and isolation; disposable HTTP exercise for trial/exhaustion/paid
   transition. Run full gates and browser account receipt, commit and archive.

### Verification

Production callers use the same injectable ledger tested with SQLite. HTTP
checks boot the production server with an isolated DB and mock upstream; no
real Stripe or funded upstream acceptance is claimed.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/trials.test.mjs
- gate: quality
- gate: build
- gate: test_http
- gate: verify

## Perfection Loop

### Loop 1 — RED / GREEN

Inspected db, free-pool, gateway, billing, settlement, store models and schema
helpers. Reuse existing credit holds and free-pool concurrency transaction.
Trial ledger is a separate injectable SQL layer, not another billing engine.

### Loop 2 — AUDIT / ADVERSARIAL

Expiry must not delete settlement identity. Trial overrun may exhaust the grant
but never silently charge the excess. Failed quota admission rolls back trial
reservation. Legacy users receive no fresh windfall: historical free usage is
snapshotted against their grant. Gateway budget is issuance-based, not a daily
promise. Unknown/stale pool refuses trial calls. Missing pairs refuse automatic
conversion. Verify email is required but no email-delivery flow is claimed.

### Loop 3 — final convergence

Caller paths: gateway free branch → trial route → reserveFreeCall/ledger;
recordUsage → trial settlement; account page → trial summary; models endpoint →
pair rates. Activation is deliberately disabled; automatic upstream refresh,
shared subscription capacity, RPM controls, email verification delivery and
real payment/funding acceptance retain their launch checklist requirements.
All planned code is reachable even though production activation is off. Plan
converged before edits; resume authorizes this configurable implementation.

### Missed Questions

- Final trial size? Configurable, 100,000 development default; not activated.
- Which models? Explicit environment pair map, empty by default; no inferred pairs.
- Shared billing source? Trial remains `free`, subscription/credit unchanged.

## Resolution

Steps 1–5 implemented. Additive trialSchema is called from db bootstrap;
gateway → reserveTrialRoute → reserveFreeCall → reserveTrial; usage settlement
calls settleTrial in its transaction; account → TrialCard; model API → trialOffer.
Requested public model and serving upstream id are recorded independently.

Verification on 2026-10-29: lint exit 0 with zero warnings; typecheck exit 0;
118/118 unit tests; quality PASS (400-line ceiling, 197 files); 51-route build;
existing HTTP suite 100 checks PASS; trial-http-suite all checks PASS, wired
into test:http/verify/pre-push. One concurrency fixture initially requested more
than its grant after prompt overhead; corrected its budget to fit one request.
Final rerun passed concurrent admission, new-key exhaustion, paid exhaustion,
capacity refusal, error release, JSON/SSE and exact paid transition accounting.
Browser account state/rates/overflow passed at 1440, 390 and 320 pixels.

Activation remains off. Public catalog trial presentation, verification delivery,
automatic quota refresh, exact upstream cost_tokens, shared RPM/subscription
capacity and live payment/funding acceptance remain launch checklist controls;
this FID does not claim a launch-ready service. Commit and archive pending.

## Lessons Learned

Lifetime customer grants and recurring upstream capacity require separate ledgers.
