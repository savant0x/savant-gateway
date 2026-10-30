# Session record: launch FID implementation begins (044, 047)

**Session ID:** 2026-10-30-launch-implementation
**Status:** completed
**Initial commit:** `181fd39`
**Mode:** single-agent ECHO v0.1.2, strict, autonomy 3

## Intent before edits

Implement the first two launch FIDs in dependency order as requested: 044
(offering, verified rates and provider economics) and 047 (security boundaries,
isolation and secret-safe errors). Continue into later children only if these
close with real evidence. Funding, external financial transactions, offering
activation and deployment remain operator-only; trials stay disabled and no
plan is offered for sale.

## Condition check before implementation

The planning baseline was `b0b65ac`; source last changed at `ca7710e`
(FID-2026-1030-042). The only commits after the baseline are documentation
(`6964e63`, `181fd39`), and `git log -- lib app tests config` lists no later
code commit. The working tree holds only the two inherited, untracked research
documents. Source, configuration and provider contracts are therefore unchanged
from the audited condition, so the document Perfection Loop is not re-run; that
determination is recorded rather than assumed.

## Approved work in this pass

1. **044 — implementation up to the operator boundary.** Build the dated
   offering evidence ledger, distinguish unknown from zero, reconcile the
   existing tested economics, and confirm the activation paths that must stay
   closed. A dated operator ruling on rates, permission, limits, budget and
   monetary policy is the remaining closure input and is requested, not
   invented.
2. **047 — full implementation.** Inventory ownership and credential flows,
   exercise spoofing and cross-account paths, apply one redaction policy to
   public diagnostics, durable usage errors and logs, test revocation and
   rotation, validate the provider outbound boundary, and document actual
   behavior in `SECURITY.md`.

## Boundaries preserved

No credential values are read, printed or committed. No offering, trial, plan,
wallet funding, payment exercise or deployment is activated. Existing account
sessions, key hashes, reservation rows and purchased snapshots are preserved.
Local runtime state and the inherited research files stay unstaged.

## Planned verification

`npm run verify` (lint, typecheck, unit tests, quality, production build, HTTP
and trial HTTP suites), `node scripts/attribution-guard.mjs`, `git diff --check`,
plus the FID-declared test gates. Evidence is pasted from tool output; no status
is closed on a plan alone.

## Result

**044 — implemented to the operator boundary.** `docs/offering-evidence.md`
records observed, configured, unknown and pending inputs with dates and sources;
the reconciliation formula keeps fee and fixed cost unknown instead of zero. The
conservative paid-traffic cap from the recorded $0.00 wallet is zero paid
upstream spend. Activation paths were verified closed (trial defaults off with a
zero budget and no pairs; no purchasable plan row locally). The record stays
active `converged`: closure needs the six dated operator rulings listed in the
ledger.

**047 — implemented and closed against `2ef2d74`.** Added `lib/redaction.ts` and
applied it at the log, usage-settlement, provider-error, provider-runtime and
benchmark-attempt boundaries; extracted the pure provider error reader so it is
testable; rejected credentials in provider URLs; stopped provider redirects;
bounded login guessing per account; added `tests/security-boundaries.test.mjs`
and a route-level matrix covering cross-account listing/deletion, revoked keys,
suspension/recovery, spoofed forwarded headers, production console guards,
a provider credential echo and a redirect probe. `SECURITY.md` now describes
actual behavior and its operational preconditions.

## Verification

```text
npm run verify: exit 0
lint: eslint ., zero warnings
typecheck: tsc --noEmit, exit 0
unit tests: 217 pass, 0 fail, 0 skipped
quality: PASS (400-line ceiling, 235 files scanned)
production build: exit 0
http-suite: 170 checks PASS
  - new: spoofed forwarded headers, revoked key, suspended key/session,
    rotating-address login ceiling, credential-echo redaction, redirect no-follow
trial-http-suite: all checks PASS
attribution-guard: PASS
git diff --check: clean
```

FID-declared 044 gates: 32 tests pass across business-model, pricing,
price-comparison and trials. FID-declared 047 gates: admin-session,
customer-session, http and security-boundaries tests all pass.

No credential value, wallet funding, payment exercise, offering activation,
trial enablement, plan sale, deployment or release occurred. The inherited
research documents remain untracked and were not used as rate or legal truth.

## What comes next

044 stays blocked on the operator rulings in its ledger. With 047 closed, its
dependents 053, 055, 057 and 061 have that prerequisite satisfied when the
operator requests them; 045, 046 and 048 list 044 as a dependency, so they wait
on the same offering decisions. The remaining eighteen active launch plans are
unchanged and unclosed.
