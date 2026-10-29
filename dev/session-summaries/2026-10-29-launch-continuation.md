# Session: Launch continuation — 2026-10-29

Status: active. Operator requested `resume the work` after the visual rollout.
Wallet funding and Stripe setup retain the operator's near-launch timing.

Intent before edits: repair provider metadata prerequisites under FID-014,
then continue the one-time trial contract. Asked the operator to select the
trial size; no entitlement amount has been assumed or enabled.

FID-014 converged before implementation. Scope: upstream weights independent
of free eligibility, context aliases and partial metadata fallback, strict
known-cost parsing, regression tests and full gates. No live data mutations.

Implemented normalization in `lib/providers/catalog.ts` and declared the public
context alias in provider types. Six new regression tests pass. Full verify:
lint zero warnings, typecheck exit 0, 113/113 unit tests, quality PASS (191
files), 51-route production build and 100 HTTP checks. Call path reviewed:
syncProvider calls buildSyncedModels, then replaceModels persists tokenWeight
and contextWindow. Group defaults still separate allowFree from token weight.

Read-only catalog audit found six exact paid-id candidates among eleven free
models; five have no exact counterpart. Added `docs/trial-conversion-contract.md`
with explicit candidates, no guessed substitutions, lifetime grant uniqueness,
atomic reservation/settlement requirements, migration decisions and acceptance.
This is a proposal, not a trial implementation. Trial amount selection remains
pending operator input; credentials and funding retain their existing timing.

FID-014 implementation committed as `ae9c363`, closed and archived with its
verification receipt. L1 complete; L2 remains active pending the trial amount
decision. The launch checklist requires this operator-selected entitlement.
