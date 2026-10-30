# Session handoff: provider account truth and daily trial credits

**Session ID:** 2026-10-30-provider-account-truth
**Status:** completed
**Date:** 2026-10-30
**Initial commit:** `b9764fe`
**Implementation:** `d31d9e0d6980245e2732b9f03ec9e69983acbcd5`
**FID closure:** `1e47c9f`
**Branch:** `main`; both commits pushed normally to `origin/main`

This handoff closes the requested quota/allocation session. It does not close
the launch program or authorize another implementation during this closing turn.
The session record is [provider account truth](2026-10-30-provider-account-truth.md).

## Required grounding

1. Read `AGENTS.md`, `ECHO-single-agent.md`, and the governing
   `dev/echo-v0.1.2-single-agent.md` completely. This is a single-agent repository;
   the harness Hybrid Mode is not authority to bypass document convergence.
2. Read `protocol.config.yaml`, current `SCOPE.md`, `knowledge.md`, this handoff,
   [archived FID-063](../fids/archive/FID-2026-1030-063-provider-account-truth.md)
   and [its audit](../audits/2026-10-30-provider-account-truth.md).
3. Inspect the current working tree and commits. Preserve both untracked files:
   `docs/research/AI Inference Gateway Research.md` and `docs/research/gem-review.md`.
   Do not assume a local remote-tracking ref establishes remote state forever.

## Operator intent and decisions

The operator reported 19.6M used / 368.1K remaining in our admin panel while the
provider dashboard showed 0 used / 20M remaining. They required a complete trace,
FID and Perfection Loop, and emphasized that each check must obtain real current
upstream values rather than stale success.

They supplied an APInex email describing the complimentary 20M as an introductory
integration sandbox attached to the master account; commercial production is
PAYG wholesale with selectable RPM tiers and commercial routes. This is written
provider context, not a confirmed model rate card, funded wallet, specific
resale agreement, or evidence that this independent gateway inherits APInexGate
repairs. See `docs/offering-evidence.md`; personal email details were not copied.

The operator then selected **daily allocated trial credits** backed by the shared
resetting pool: reserve usage downstream, route internally, and align backend
allocation with actual API quota/reset values. This is the existing daily ledger,
not activation of the separate one-time trial system.

## Diagnosis and delivered behavior

At 15:42 UTC the stored snapshot was from October 29 21:15:21 UTC:
19,631,919 used / 368,081 remaining. A direct authenticated subscription GET
returned 0 used / 20,000,000 remaining, reset October 31 00:00 UTC. The upstream
API agreed with the provider dashboard; the gateway had retained yesterday's
catalog-sync snapshot and labelled it live. That snapshot also fed admission.

FID-063 implemented and closed:

- A single no-store account refresh service, independent of catalog replacement.
  Every explicit account check and free-route admission fetches upstream; only
  overlapping in-flight checks share work. No success TTL replaces a check.
- SQLite lease owner/deadline and configuration invalidation fence late writers.
  Pending/failed checks invalidate prior observations. Numeric parsing preserves
  explicit zero and rejects coercion of null/blank/boolean into zero capacity.
- Request-start observation, completion, actual upstream reset and unlimited/error
  metadata are separate from catalog `synced_at`. The 30-second age guard is a
  safety expiry, not a cache reuse policy. The supported free reset is UTC midnight;
  a missing, expired or inconsistent boundary cannot authorize a new allocation.
- Admission rechecks inside the existing immediate transaction, subtracting local
  completions since observation start and all live serving-provider holds.
  Ambiguous overlap is conservative; raw upstream counters and local admission
  estimates are displayed separately. Estimated requests cannot cross the floor.
- Admin overview, providers, gateway settings, and customer trial-credit checks
  use the account path. Current figures clear while checking, after errors and
  on expiry. Operator and customer controls check every 15 seconds while visible.
- Daily allocation uses observed capacity beneath a configured ceiling. Returning
  grants shrink when capacity changes; suspended accounts release unspent shares
  while recorded usage/holds remain. Cross-reset holds still constrain admission.
  Daily trial credits never modify the prepaid dollar wallet. Lifetime mode
  cannot also issue daily allocations.
- Fixed inherited build warnings in startup instrumentation through a Node-only
  dynamic import and the existing explicit filesystem tracing convention.

## Source map

| Responsibility | Files |
| --- | --- |
| Strict parsing and observation validity | `lib/provider-quota.ts` |
| Leases, fenced writes and conservative remaining | `lib/quota-ledger.ts` |
| Upstream account reads | `lib/providers/runtime.ts`, `lib/providers/request.ts` |
| Additive metadata and current projections | `lib/schema/providers.ts`, `lib/store/providers.ts` |
| Independent catalog clock | `lib/providers/sync.ts` |
| Request path | `lib/gateway.ts` → `lib/gateway-trial.ts` → `lib/store/free-pool.ts` |
| Observed allocation and usage | `lib/store/allocations.ts`, `lib/allocation-ledger.ts`, `lib/store/daily-trial.ts` |
| Operator check | `app/api/provider/runtime/route.ts`, `components/dashboard/provider-card.tsx` |
| Customer check and display | `app/api/account/trial/route.ts`, `components/account/daily-trial-*.tsx` |
| Shared client check behavior | `components/dashboard/use-provider-runtime.ts` |
| Regression coverage | `tests/quota-refresh.test.mjs`, `tests/allocation.test.mjs`, `tests/free-pool.test.mjs`, `scripts/http-suite/quota-checks.mjs` |

## Verified evidence

Final implementation verification and the normal push's mandatory gates passed:

```text
npm run verify: exit 0
lint: zero warnings
typecheck: exit 0
config-check: PASS (non-production)
tests 242 / pass 242 / fail 0
quality: PASS (400-line ceiling, 247 files scanned)
production build: clean, no warnings
http-suite: 242 checks PASS
trial-http-suite: all checks PASS
attribution-guard: PASS (no coding-agent credit found)
git diff --check: exit 0
pre-push: all gates passed
b9764fe..1e47c9f main -> main
```

Ignored local logs: `data/verify-063.log`, `data/push-063.log`. They are local
receipts, not committed artifacts. The archived FID and session record retain
the durable receipt and caller evidence.

Live local check at **16:09:18 UTC, October 30** returned HTTP 200, balance $0,
0 used / 20M remaining, next reset October 31 00:00 UTC, matching the upstream
subscription response. Before that success, upstream `/balance` timed out and
returned HTTP 522. The failure was exposed as unavailable, not old success.
Those numbers are dated observations: fetch again next session. No paid/model
generation, payment, funding, message, offering activation or deployment was used.

Local non-secret configuration read: daily allocation enabled, 20M ceiling,
9000 bps allocatable share, 100k weighted tokens/account/day, 1M provider floor,
2M alert threshold. No settings override rows were present. There were zero
eligible active key-holding accounts and zero active plans at that read.
`TRIAL_ENABLED` was false and remains false. Do not confuse this lifetime switch
with the already operating daily trial-credit path.

## Evidence limits and active launch obligations

- HTTP exercises actual production routes, rendered HTML and disposable SQLite
  accounting. Interactive browser button/poll behavior and an actual overnight
  provider rollover were not observed in this receipt; acceptance belongs to
  049/056/062. A unit-simulated reset is not a witnessed upstream reset.
- This is request-driven freshness plus visible-page polling, not an unattended
  scheduler or operational alert service. In-flight coalescing is not an
  aggregate provider admission limit. Metadata endpoint rate limits, polling
  fanout and production capacity require the 048/059/060 contracts and evidence.
- 048 remains an active implementation obligation. Source still uses one shared
  free bucket and independent paid-key buckets, not an all-mode upstream-account
  RPM/concurrency gate. `tests/provider-admission.test.mjs` is absent.
- 049 remains active: 063 implements its demonstrated refresh/reset and daily
  allocation repair, not every trial/launch acceptance obligation.
- 050's actual usage/cost semantics and 051's durable settlement/crash recovery
  remain active. `tests/usage-fidelity.test.mjs` is absent; known arithmetic
  tests do not establish equivalence to a real provider wallet debit.
- 044 still needs exact commercial/rate/budget/policy rulings. The email resolves
  the master-account sandbox interpretation and states commercial PAYG; it does
  not supply all remaining closure evidence.
- 057 remains active after its prior readiness implementation. Its header uses
  a nonstandard `implemented (...)` status. Reconcile against source, commit and
  remaining requirements before making a lifecycle claim. Readiness is not
  deployment/ingress/drain/restore acceptance.
- Nineteen FIDs remain in the active directory: master 043 and launch children
  except archived 047; 063 is archived. Directory membership is not implementation
  proof. Verify each referenced source before reporting its status.

## Next-session sequence

1. Reconstruct current scope and verify the committed source/receipts. Do not
   redo or reopen 063 merely because external observations age.
2. Reconcile 044's evidence with the provider email and the daily-credit decision;
   retain exact missing decisions instead of assuming permission/rates/funding.
3. Re-audit 048 against 063's async routing/account-refresh changes and trusted
   actual provider limits. It is the next recommended engineering priority before
   claiming platform capacity across free/trial/subscription/prepaid traffic.
   Re-run the document Perfection Loop before implementing a changed contract.
4. Continue 049's actual remaining obligations and 050 → 051 in dependency order.
   Implement work whose prerequisites are satisfied; present concrete operator
   blockers while continuing independent authorized work. Preserve the master
   launch register and all remaining child contracts.
5. Use the declared npm gates, prove production callers and real financial effects,
   commit explicit paths, archive only with evidence, and push verified slices.

The current closing request authorizes this handoff, not automatic continuation
into another implementation. Funding, financial transactions, email/alert sends,
one-time trial activation, subscription sales, provisioning, release tags,
publication and deployment require their existing explicit operator authority.
No secret values or databases belong in the tree; do not print credentials.
Do not rewrite project files through scripts or stage the operator's research.

## Session closure

Q1–Q5 implementation obligations are complete in the linked committed receipt.
The operator requested a proper handoff and session close after that push. This
document and the closure entry in SCOPE fulfill that request; no new feature is
started. The closing documentation commit runs normal repository verification
and is pushed with the mandatory hooks. Historical launch handoffs remain dated
records; this document is the entry point for the next session.
