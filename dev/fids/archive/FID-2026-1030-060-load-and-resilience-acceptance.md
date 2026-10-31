# FID: Measured load, capacity and resilience acceptance

**Filename:** `FID-2026-1030-060-load-and-resilience-acceptance.md`
**ID:** FID-2026-1030-060
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-046, FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-050, FID-2026-1030-051, FID-2026-1030-055, FID-2026-1030-057, FID-2026-1030-058, FID-2026-1030-059
**YAGNI-Compliance:** Verified — one bounded workload/fault runner against the real production artifact, no speculative scale claims.

## Summary

Implemented a bounded production-build acceptance runner that measures the
supported service envelope and reconciles every dispatch against durable
settlement, usage, ledger and held credit. The 2026-10-31 run passed 123/123
checks: 229.84 sustained admitted rps at p95 137.53 ms, 186.7 MB peak RSS,
5.07 MB database, zero unresolved admissions and zero ledger/held differences.
The candidate safe cap is 160.89 rps at 30% headroom. That is a local fixture
measurement, not approved production capacity: operator approval, a real
provider budget and the production-equivalent host remain
`FID-2026-1030-060-LIVE`.

## Environment

- **OS:** Windows 11 development host; Linux container target (Fly, Node image).
- **Language/Runtime:** Node.js v24.21.0 (repository engine >= 22.18.0),
  Next.js 16.4.3, better-sqlite3 13.0.3.
- **Tool Versions:** npm; SQLite bundled with better-sqlite3; `node --test`;
  production build `Ncl7cgkj2j5fuOzzLPT1A`.
- **Commit/State:** implementation `8c10a07`; the closure and documentation
  changes are in the commit that contains this record.

## Detailed Description

### Problem / expected behavior / root cause

Unit/HTTP correctness receipts did not establish throughput, stream concurrency,
memory, storage contention or recovery time. Historical upstream 15 RPM and a
large free pool could not be translated into thousands of concurrent usable
accounts. No runner existed to measure the production artifact, no capacity
invariant file existed, and no test exercised a truncated upstream stream.

### Evidence

`scripts/http-suite/harness.mjs` already provided disposable servers and
providers. `lib/gateway-rate-limit.ts` and `lib/provider-admission.ts` are
process-local. Launch plan phase 3 requires load measurements and phase 6
requires a bounded initial cohort/spend approval.

### Implementation finding

The planned truncated-source fault exposed a real defect: the SSE relay called
`finish("ok")` after a clean upstream close even when no `[DONE]` terminator had
arrived. A partial answer was therefore acknowledged and charged as a successful
estimate. `lib/gateway-stream.ts` now settles that condition as `error`, does not
forward `[DONE]`, and releases admission. Four HTTP regression checks cover it.

The first measurement also found a fixture error, not a gateway defect: the
competing-reservation probe used a prompt estimate below the mock's reported
usage, so the documented hold-overrun path produced a negative balance. The
probe was resized so the hold covers actual usage, isolating reservation
correctness. A second measurement found a Windows resource parser reading the
PID column instead of the memory column; it was corrected and checked against
`process.memoryUsage()`.

## Impact Assessment

### Affected Components

- `config/load-envelope.json` — candidate budget, targets and workloads.
- `scripts/load-acceptance.mjs` and `scripts/load/*` — bounded runner, workload,
  fault, reconciliation, resource and verdict modules.
- `scripts/http-suite/harness.mjs` — opt-in delay/failure/stream controls with
  unchanged defaults.
- `scripts/http-suite/systems-checks.mjs` — truncated-stream regression.
- `lib/gateway-stream.ts` — error settlement for a missing completion marker.
- `tests/capacity-invariants.test.mjs` — admission invariants.
- `package.json`, `protocol.config.yaml` — explicit `test:load` gates.
- `docs/load-acceptance.md`, `docs/deployment-runbook.md`, `docs/README.md`,
  `AGENTS.md`, `CHANGELOG.md` — operator procedure and evidence boundary.

### Risk Level

- [x] High: capacity and financial-outcome acceptance.
- [ ] Critical
- [ ] Medium
- [ ] Low

## Proposed Solution

### Approach and steps

1. **implemented** — operator-editable envelope with serving RPM/concurrency,
   fixture delay, request/stream budgets, workload counts, latency/error,
   memory/database and reconciliation targets. Operator approval remains
   `blocked` as `FID-2026-1030-060-LIVE`.
2. **implemented** — ramp, burst, steady, mixed-billing, long-stream,
   cancellation, key-churn and competing-reservation workloads against the real
   production artifact and SQLite.
3. **implemented with named bounds** — provider 429/5xx, disconnect, malformed
   JSON, truncated stream, quota reset, process crash, database contention,
   storage-write rejection and alert failure. Actual 120 s/300 s deadline waits
   and ENOSPC are **blocked** on a production-equivalent run; the receipt names
   the substitutes.
4. **implemented** — measured safe cap, bottleneck/headroom, no-go thresholds,
   drain/shedding proof and an independently reconciled receipt. Production
   approval remains `blocked`.

### Verification

`tests/capacity-invariants.test.mjs` covers interleaved admission, refusal
without RPM spend, alias sharing, idempotent release and unknown-ceiling
refusal. `scripts/load-acceptance.mjs` is the additional documented gate:
`npm run test:load` measures the candidate envelope;
`npm run test:load:accept` exits 2 without dated operator approval. Existing
`npm run test:http` remains regression and now covers the truncated-stream path.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/capacity-invariants.test.mjs
- gate: test
- gate: quality
- gate: build
- gate: test:http
- gate: test:recovery
- gate: test:load
- gate: verify

### Verification Receipt

- verified: 2026-10-31T20:22:31.312Z (load receipt); 2026-10-31T20:21:54Z (full gate)
- implementation: `8c10a07`
- lint: exit 0
- typecheck: exit 0
- `node --test tests/capacity-invariants.test.mjs`: 5 passing
- `npm test`: 381 passing, 0 failing
- quality: PASS (400-line ceiling, 340 files scanned)
- build: exit 0; production build `Ncl7cgkj2j5fuOzzLPT1A`
- test:http: 722 checks PASS; trial suite PASS
- test:recovery: PASS (7 concurrent writes, 1929 ms)
- test:load: PASS (measurement), 123 checks, 0 failures
- test:load:accept: exit 2 as designed (no dated operator approval)
- verify: exit 0
- load receipt: `dev/audits/2026-10-31-load-acceptance.json`
- measured: ramp 24/24 at 1, 2, 4 and 8 concurrent; 9/24 at 16 with 15
  provider-scoped 429; steady 120/120 at p50 17.36 / p95 137.53 / p99 143.49 ms
  and 229.84 rps; burst 16×200 / 32×429; 16 long streams and 8 cancellations
  settled; mixed billing 12 free + 12 credit; reservations 2×200 / 14×402;
  key churn 9 created / 3 refused / 9 revoked.
- fault/control: all 12 fault attempts settled; truncated stream status error and
  no `[DONE]`; quota 200/503/200 + free 200; contention 390 ms; alert exit 1
  and failed delivery; drain 503 then 4 stream settlements and resume 200;
  crash 4 admitted → 4 quarantined, 0 usage; storage write 500 → 1 quarantined.
- reconciliation: 310 committed, 310 usage, 5 quarantined, 0 admitted, 0
  committed/usage mismatch, 0 micros ledger difference, 0 micros held
  difference, 0 negative accounts, SQLite `ok`.
- resources: 186.7 MB peak RSS, 5,074,712 bytes database.
- verdict: 229.84 sustained rps; candidate safe cap 160.89 rps (0.7 headroom);
  peak short ramp 392.71 rps; bottleneck provider concurrency 8 plus SQLite
  write serialization.

## Perfection Loop

### Loop 1 — RED

- **RED:** no measured safe envelope, no capacity invariants, no truncated-stream
  regression.
- **GREEN:** bounded runner, candidate envelope, invariant test and stream repair.
- **AUDIT:** all declared gates pass.
- **ADVERSARIAL:** a load run can appear healthy by refusing work or by leaving
  admitted rows unresolved. The runner counts dispatch at the fixture upstream
  and settlement/usage/ledger in SQLite, not from client responses.
- **CHANGE DELTA:** implementation added; design contract unchanged.

### Missed Questions

1. **How is a safe cap chosen?** Use sustained steady throughput, not a short
   ramp peak: 229.84 × 0.7 = 160.89 rps, explicitly candidate-only.
2. **What happens when the envelope is malformed?** Validation throws before
   the first request; no value becomes "unlimited".
3. **Does a refused burst consume financial capacity?** No; refused calls create
   no settlement, usage or hold, and burst requires a real admitted floor.
4. **Can a truncated stream pass as success?** It did before this FID; now it
   settles as error and never forwards `[DONE]`.
5. **Does a crash refund or double-debit?** No; four admitted rows and holds
   survive, no usage is written, and expiry produces four explicit quarantines.
6. **Is a local mock capacity claim?** No; the receipt lists no real upstream,
   no Fly volume, no ENOSPC, no deadline wait and no hosted proxy.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** implementation `8c10a07`; closure record in the containing
  commit.
- [x] **File:line ranges:** `scripts/load-acceptance.mjs`; `scripts/load/*`;
  `lib/gateway-stream.ts` terminal-marker check; `tests/capacity-invariants.test.mjs`;
  `scripts/http-suite/systems-checks.mjs` truncated block.
- [x] **Gate output:** receipt above; full `npm run verify` exit 0.
- [x] **Reproducibility:** `rg "load-acceptance|capacity-invariants|without a completion marker"`.
- [x] **Step statuses:** 1–2 implemented; 3 implemented for bounded faults with
  ENOSPC/deadline blocked; 4 implemented with operator approval blocked.

### Code Verification Evidence

- [x] Files referenced in Affected Components exist.
- [x] Implementation matches the Proposed Solution.
- [x] Typecheck/tests/lint pass with pasted output.
- [x] Production call-graph evidence: `npm run test:load` boots the real
  `next start`, seeds a provider row, calls `/v1/chat/completions`, and reads the
  same SQLite file the server wrote.
- [x] FID status reflects local implementation closure and a named live blocker.

### Loop 2 — Independent audit and self-correction

- **RED:** first run exposed the reservation probe's under-estimated prompt;
  the fault matrix exposed the missing-terminator success; the first resource
  reading was a PID, not RSS.
- **GREEN:** sized the reservation probe; settled truncated streams as error;
  parsed the correct Windows memory column and verified it against
  `process.memoryUsage()`.
- **AUDIT:** 123/123 load checks, 381 unit tests and 722 HTTP checks pass.
- **ADVERSARIAL:** the run cannot prove real provider latency, the Fly volume,
  ENOSPC or hosted proxy behavior; the envelope has no operator approval.
- **CHANGE DELTA:** three self-corrections, no design change.

### Loop 3 — Final convergence

- **RED:** final risks are external: operator approval, real upstream budget,
  production-volume ENOSPC/deadline and hosted ingress.
- **GREEN:** named them in the receipt, docs and tracking ledger rather than
  widening the local claim.
- **AUDIT:** final load receipt at `8c10a07` has 0 failures; full gate exit 0.
- **ADVERSARIAL:** a local pass is not permission to publish 160.89 rps as a
  capacity promise. The documentation says candidate only.
- **CHANGE DELTA:** stable.

## Resolution

- **Closed Date:** 2026-10-31
- **Fix Description:** added the bounded load/fault acceptance runner, candidate
  envelope, capacity invariants, truncated-stream repair and operator docs. The
  runner measures the real production artifact and reconciles dispatch,
  settlement, usage, ledger and holds independently.
- **Tests Added:** `tests/capacity-invariants.test.mjs` (5); four HTTP
  truncated-stream checks; 123-check load receipt.
- **Verification Evidence:** `dev/audits/2026-10-31-load-acceptance.json`;
  `npm run verify` exit 0; 381 unit tests, 722 HTTP checks, quality (340 files),
  build, recovery drill and load measurement pass.
- **Archived:** 2026-10-31
- **Residual:** `FID-2026-1030-060-LIVE` is blocked on dated operator approval,
  a funded real provider budget, the production Fly volume/ENOSPC and the
  hosted proxy/deadline observations.

## Lessons Learned

Capacity is a measured envelope with rejection, quarantine and recovery
semantics, not a token count or a marketing number. A fault harness earns its
keep by finding a behavior the happy-path suite accepted as success. Keep local
measurements and operator-approved production capacity in separate claims.
