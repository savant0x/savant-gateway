# FID: Content automation and persistent matching master

**Filename:** `FID-2026-1104-018-content-automation-master.md`
**ID:** FID-2026-1104-018
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 23:20 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

Coordinate three bounded contracts that make source fetching automatic,
historical outcomes inspectable, model-link acceptance persistent, and matching
manageable across the entire content archive. This is the planning deliverable;
it authorizes no coding, deployment, external scheduler or service purchase.

## Environment

- Windows/PowerShell; Node v24.21.0; Next.js 16.4.3; PostgreSQL/PGlite.
- Grounding HEAD `f6d2a5b`; two pre-existing untracked chat exports preserved.
- SCOPE CA1–CA5; strict single-agent ECHO v0.1.2, autonomy 3 for planning.
- Operator instruction, verbatim: "This is big enough for a multi fid + perfection
  loop only. You are the planning agent, not the coding".
- Persistence instruction, verbatim: "The entire point of tagging it is so the
  link is persistant".

## Detailed Description

### Problem

The operator observed stale sources requiring a manual fetch, an incomplete
view of automatic model associations, and unclear matching timing/settings.
Reading the actual call graph establishes a scheduler wiring gap, capped
activity previews, hardcoded fetch-time matching, non-durable dismissals,
machine self-review and inconsistent public filtering.

### Expected Behavior

Every enabled source participates in configured recurring ingestion. Every
fetch has an inspectable outcome. Explicitly accepted associations remain on
the content and exact model. Dismissed associations stay removed from active
use. One complete management page and bounded rematch flow make detection,
publication and review explainable and controllable.

### Root Cause

The foundation implements individual ingestion and link writes without the
execution, decision and management lifecycle around them. Extending the existing
authorities addresses the shared causes without creating parallel pipelines.

### Evidence

| Contract | Current production path | Demonstrated gap |
| --- | --- | --- |
| FID-015 | POST cron → due sources → claims → ingest → cycles | No repository scheduler; GET/secret mismatch; eight-cycle preview |
| FID-016 | ingest → suggest → link upsert; admin → delete | Self-reviewed matches; dismissal can resurrect; public detail lacks filter |
| FID-017 | admin → 15 recent links; fetch → matcher | No full inventory/settings/rematch; catalog changes do not revisit old items |

Baseline command, run 2026-11-04 before documentation edits:

```text
node --test tests/content-ingest.test.mjs tests/content-linking.test.mjs
  tests/content-store.test.mjs tests/content-sources.test.mjs
  tests/content-taxonomy.test.mjs tests/catalog-skus.test.mjs
  tests/model-identity.test.mjs
exit 0
tests 55
pass 55
fail 0
cancelled 0
skipped 0
duration_ms 9122.4697
```

Existing tests prove the current foundation, not the new contracts. Planned test
files are deliberately absent until a coding session creates them.

An in-memory production-store experiment also reproduced deletion/resurrection,
stale links after empty reconciliation, detail/coverage disagreement and sibling
alias overmatch. Exact output is retained in the planning session receipt.

## Impact Assessment

### Affected Components

Only FIDs, SCOPE, the FID register and this session's planning receipt change in
this pass. Future implementation touches isolated content schema/stores, existing
settings, cron/admin entry points and the content/model public read projections.
It also adds a transactional catalog invalidation signal, without changing
routing, credit, subscription, prices or the model identity rules.

### Risk Level

- [x] High: source freshness and durable review intent are core feature behavior.
- Uncontrolled scope risks are bounded by the three child ownership contracts.
  Existing source/content deletion remains deliberate and destructive.
- No secret values, real-money requests, hosted writes or external messages.

## Proposed Solution

### Approach

| Child | Owns | Depends on | Implementation order |
| --- | --- | --- | --- |
| [015](FID-2026-1104-015-content-fetch-automation-and-history.md) | Scheduling, fetch policy, execution budget, source/run history | Existing ingestion/claims | First |
| [016](FID-2026-1104-016-persistent-content-model-decisions.md) | Link states, accept/dismiss/restore, migration, reconciliation, public visibility | Existing content ids/catalog | Second |
| [017](FID-2026-1104-017-content-matching-controls-and-review.md) | Full inventory, matching policy/aliases, rematch and catalog invalidation | 015 execution; 016 decisions | Third |

015 and 016 are logically independent but this single-agent implementation order
is sequential. 017 must not ship before both contracts. The master is completed
only when all child implementations have real committed verification receipts;
planning convergence does not close it.

Ownership rules:

- Fetch settings/history belong to 015; matching settings/jobs to 017. Both use
  the existing settings authority and shared heartbeat/budget infrastructure.
- 016 alone defines acceptance/dismissal/visibility; 017 only invokes it.
- Topic tags remain normalized content metadata; model links remain exact pairs.
  No new paid classifier or model-routing identity is introduced.
- Existing auto publication is labeled automatic during migration. New detections
  default to review-required; automatic publication is an explicit policy option.
  Accepted rows are never cleared by detection mode changes or no-match results.
- Authentication, same-origin checks, redaction, 400-line ceiling and real
  PostgreSQL ownership/race evidence remain mandatory.
- Scheduler backend/tier is an operator input requested during grounding and
  still unconfirmed. Keep a portable authenticated endpoint; prepare a supported
  heartbeat artifact and exact activation runbook once that input is known.
  A UI enabled flag never discharges the hosted heartbeat observation.
- Use existing browser verification work (FID-009) where available; this feature
  still owes its own specific receipt. An unrelated FID's status is not proof.
- The automation pause stops admitting both fetch and rematch work; matching-off
  pauses detection/rematch while source fetching can continue. Heartbeats still
  log paused state. Accepted/dismissed decisions persist in either condition.

Five Questions review: finite due batches cover the whole configured inventory;
durable claims/revisions govern competing instances; guarded APIs and redaction
bound hostile input; shared stores and explicit lifecycle states support future
maintenance; evidence-backed history and real race proofs define the quality bar.
Capacity/freshness targets remain measurable claims, never invented guarantees.

### Steps

1. **implemented (design):** trace all paths and register three child scopes.
2. **implemented (design):** independently challenge each child, correct concrete
   gaps and measure document deltas. Final frozen-document audit hashes and two
   unchanged convergence passes are retained in the session receipt.
3. **implemented (design):** structure/reference/test-gate review passes 163
   checks; baseline check, tests, quality and build pass. The session receipt
   distinguishes four PostgreSQL-only skips and future implementation gates.
4. **blocked — coding reserved:** implement children in the stated order with
   regression proofs and logical path-scoped commits, then close/archive each.
5. **blocked — external activation inputs:** operator confirms scheduler backend,
   secret provisioning and deployment permission; record two real hosted ticks
   independently of implementation closure. Never invent live acceptance.

### Verification

Future combined acceptance must demonstrate:

1. With no browser open, two authenticated ticks process all due fixture sources
   across bounded batches, preserve disabled sources, and retain outcomes.
2. A stopped scheduler or failed source cannot appear as a fresh successful fetch.
3. Accept a link, change title/aliases/settings, refetch and rematch, restart:
   it remains attached to content and the same eligible exact model.
4. Dismiss a pair, refetch and rematch: it stays absent publicly; explicit
   restore is the only route back to a suggested/accepted state.
5. More than 100 associations remain reachable via complete inventory paging,
   including accepted content older than the recent preview.
6. A new model/alias triggers a bounded stored-content job, including articles
   no longer in upstream feed windows, without fetching publishers again.
7. Overlapping requests, killed owners, stale revisions and budget exhaustion
   never duplicate ownership or undo accepted/dismissed decisions.
8. All public consumers agree on visibility; pending/dismissed/retired rows are
   absent from detail, coverage, model filters, briefing and linked-item counts.
9. Native browser controls persist settings and decisions, support keyboard,
   both themes and narrow screens, and show real job/error states.

Each child owns its behavioral suites. Run `npm test` for the complete directory
and `npm run verify` for all eleven current gates; no invented `fid:verify` tool.
Do not use the managed-host database URL for schema-resetting test suites.
The existing PostgreSQL proof runner enumerates only settlement/admission suites;
015/016 must register their new concurrency suites explicitly. Shared HTTP probes
must run before the existing destructive readiness checks, not merely exist on disk.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/content-automation.test.mjs — planned in 015.
- gate: test tests/content-link-decisions.test.mjs — planned in 016.
- gate: test tests/content-job-concurrency.test.mjs — planned in 015; test:postgres.
- gate: test tests/content-link-concurrency.test.mjs — planned in 016; test:postgres.
- gate: test tests/content-match-management.test.mjs — planned in 017.
- gate: test tests/content-rematch.test.mjs — planned in 017.
- gate: test tests/content-ingest.test.mjs — existing.
- gate: test tests/content-linking.test.mjs — existing.
- gate: test tests/content-store.test.mjs — existing.
- gate: test tests/content-sources.test.mjs — existing.
- gate: test tests/content-taxonomy.test.mjs — existing.
- gate: test tests/content-status.test.mjs — existing.
- gate: test tests/content-guidance.test.mjs — existing.
- gate: test tests/catalog-skus.test.mjs — existing.
- gate: test tests/model-identity.test.mjs — existing.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: verify — `npm run verify`, future integrated implementation receipt.

### Verification Receipt

55/55 existing focused baseline tests pass as quoted. Final planning gates,
document hashes/deltas and limitations are recorded in
`dev/session-summaries/2026-11-04-content-automation-planning.md`.
No runtime implementation, live scheduler, UI interaction or new test exists.

## Perfection Loop

### Loop 1 — RED

- **RED:** missing scheduler contract, incomplete history/inventory, weak link
  decision lifecycle and absent matching management are distinct shared causes.
- **GREEN:** three children reuse source claims, cycle logs, link pairs,
  exact model ids, admin auth and settings rather than duplicating them.
- **AUDIT:** baseline source and test evidence above; dependency order has no
  cycles. 015 owns runtime execution, 016 decisions, 017 management.
- **ADVERSARIAL:** child overlap, phantom acceptance, a planning status mistaken
  for implemented features, hidden deployment assumptions and test artifacts.
- **CHANGE DELTA:** initial design; independent/convergence passes follow.

### Missed Questions

1. Does the operator want implementation here? No; the explicit instruction is
   multi-FID planning plus Perfection Loop only.
2. Must accepting a link mean it disappears from the review system? No; it
   leaves the suggestion queue but stays in accepted/all-active inventory.
3. Does dismissing remove the story? No; it removes that association from active
   use and retains an internal decision preventing automatic recreation.
4. Are tag weights proof of correctness? No; they are deterministic rule scores.
5. Is scheduled work automatically licensed to spend on services? No; scheduler
   tier purchases, secrets and deployment need explicit operator authority.

### Implementation Evidence (REQUIRED for `closed`)

No implementation is authorized here. Code/schema/UI/job steps are blocked by
the explicit planning-only instruction, recorded in SCOPE CA5. No closure SHA.

### Code Verification Evidence

Current source paths in each child were inspected and the focused foundation
tests executed. Planned callers and behavioral proofs remain implementation
obligations; a converged document is not production reachability evidence.

### Loop 2 — Independent audit and self-correction

- **RED:** ordinary unit success could mask absent networked ownership proofs;
  shared HTTP probes could be placed after destructive readiness checks.
- **GREEN:** assign shared concurrency/HTTP artifacts to explicit child owners
  and require actual runner registration before implementation closure.
- **AUDIT:** current proof TEST_FILES contains exactly two pre-existing suites;
  the HTTP runner calls `runChecks` last because it destroys a required table.
- **ADVERSARIAL:** no child may override acceptance/dismissal, introduce another
  scheduler timer, claim live backend confirmation or count future tests as run.
- **CHANGE DELTA:** first correction 657/12292 characters (5.345% Levenshtein).

### Loop 3 — Final convergence

Final audits check the complete child DAG, gate/test ownership, role boundary
and persistence invariants. Two final unchanged-document passes and their
hashes/deltas are recorded in the planning session receipt. No implementation
or hosted activation is inferred from document convergence.

## Resolution

Design-only. Do not set closed, archive or claim that the requested features
exist until the children have implementation commits and their required gates.

## Lessons Learned

Separate the durable inventory from a recent-activity preview. Automatic source
work and automatic matching need observable execution and stable human decisions.
