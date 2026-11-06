# Coding handoff — D51, D52 and D53

The three design FIDs are converged for a subsequent coding session. They are
not closed, and the bugs are not fixed by this planning pass. Read the single-
agent protocol, project AGENTS.md, SCOPE.md, each complete FID and every touched
file before editing. The operator requested the Perfection Loops and this
handoff, not application implementation in the planning session.

## Implement in this order

1. [FID-2026-1105-009](../fids/FID-2026-1105-009-subscription-allowance-concurrency.md)
   (D51): serialize subscription allowance admission. Apply its documented
   settlement → user → subscription → period → hold → quarantine ordering to
   all interacting paths, including sweep, renewal, revocation, account/key
   lifecycle, entitlement refresh and quarantined-hold release. Revalidate
   state after locking; preserve block/credit semantics and quarantine. Prove
   the order rather than assuming `.immediate()` locks PostgreSQL.
2. [FID-2026-1105-010](../fids/FID-2026-1105-010-payment-claim-fencing.md)
   (D52): atomically claim with a generation and fence financial effects and
   terminal event state in the same transaction. Lock event before the shared
   D51 order. Serialize distinct events for the same subscription invoice and
   recheck its status inside the effect transaction. Reuse one claim authority;
   preserve signature/environment checks and retryable failure semantics.
3. [FID-2026-1105-011](../fids/FID-2026-1105-011-tool-output-fallback-accounting.md)
   (D53): count generated tool/function names and argument fragments in the
   existing usage fallback, including translated Anthropic streams. Keep
   reported usage authoritative and the stream bounded; the FID defines mixed
   representation precedence and empty-output behavior.

## Required proof

- Add `tests/subscription-admission-concurrency.test.mjs` and
  `tests/payment-claim-concurrency.test.mjs` to the fail-closed
  `scripts/postgres-concurrency-proof.mjs` list. Use disposable PostgreSQL,
  independent connections, controlled barriers and bounded timeouts. The FIDs
  specify all competing admission, lifecycle, stale-owner, replay and rollback
  cases. Tests that only use PGlite or silently skip do not satisfy this gate.
- Add `tests/tool-output-fallback.test.mjs` and extend the FIDs' named existing
  suites. Exercise buffered and streaming settlement, missing and partial usage,
  reported zero, modern and legacy calls, Anthropic translation and cancellation.
- Exercise actual authenticated webhook routes with signed disposable fixtures.
  No real payment, provider funding or live inference is required.
- Run each FID's declared lint, typecheck, tests, quality, build, HTTP and
  PostgreSQL gates, and `npm run verify`. Grep production entry points and
  paste actual results. Review lock order, transaction nesting, failure paths,
  privacy and idempotency. Commit each verified slice and close/archive each
  FID only with its implementation commit, gate receipt and changelog entry.

## Planning evidence and limits

At baseline `4bd8c1b`, the earlier targeted suite reported 40/40 passing, but
did not reproduce either two-connection race. A direct D53 helper probe returned
`{"argumentChars":16000,"bufferedChars":0,"streamChars":0}`. The original D51
and D52 stale-read probes are historical records in ignored
`dev/audit/issues.md`; no fresh networked reproduction is claimed.

Each FID records RED, GREEN, audit, adversarial challenges and completion. The
measured edit distances for three successive review passes were 3.54%, 2.58%,
7.05% for 009; 5.79%, 0.07%, 5.70% for 010; and 5.10%, 0%, 5.67% for 011.
An exact subsequent read of each frozen document matched its prior bytes. These
are planning-document checks, not verification of the future implementation.
PostgreSQL locking and conditional upsert semantics were checked with Context7
against the PostgreSQL 17 documentation linked in the FIDs.

Planning checks: `npm run check` exit 0; `npm run repository:check` exit 0
(`18 active FIDs`); `npm run attribution` exit 0; `npm run quality` exit 0
(`647 files scanned`); `git diff --check` exit 0. These do not execute the
planned concurrency or tool-output tests, which do not yet exist.

## Boundaries

Preserve operator work and secrets. Do not perform funded inference, live
payment, provider transfers, deployment, or remote database changes as part of
this handoff. A local passing build is not proof of a production payment flow.
