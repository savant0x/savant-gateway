# Load, capacity and resilience acceptance

Status: the gate has been ported to PostgreSQL (FID-148). The 2026-10-31 run
below is a **historical SQLite-era candidate measurement** and is superseded. The
first real-PostgreSQL run on 2026-11-03 (isolated database in the configured
Supabase cluster, PostgreSQL 17.11, pooler port 6543) completed every workload
and reconciled cleanly, but failed five candidate targets: 4.76 admitted rps
against 20, steady p95 1,974 ms against 1,500 ms, ramp p95 2,211 ms, and two
mixed-billing 503s. No capacity is approved, no dated operator approval exists,
no real provider was called and no hosted proxy or production volume was
exercised. Those remain `FID-2026-1030-060-LIVE`.

The machine-readable SQLite-era receipt is
[`dev/audits/2026-10-31-load-acceptance.json`](../dev/audits/2026-10-31-load-acceptance.json).
It contains all 123 checks, status counts, percentiles, reconciliation and the
limitations list. This page is the operator-readable summary; the PostgreSQL
result is recorded in FID-148 and the CHANGELOG.

## Gate

```bash
npm run build          # the runner requires .next/BUILD_ID
npm run test:load      # measures the candidate envelope and enforces targets
npm run test:load:accept
```

`test:load` exits 0 only when every target and financial invariant passes. It is
an **additional release gate**, not part of `npm run verify` or the pre-push
hook: it is a measurement, and running it on every push would spend seconds
without changing the code verdict. `test:load:accept` runs the same measurement
and exits 2 unless `config/load-envelope.json` carries a dated operator
approval. There is no approval today, so the acceptance command correctly
refuses.

The envelope is operator-editable at
[`config/load-envelope.json`](../config/load-envelope.json): offered-call and
upstream-call ceilings, provider RPM/concurrency, upstream delay, body/stream
bounds, workload sizes, latency/error targets, memory/database budgets,
reconciliation limits and the headroom factor. A malformed envelope stops the
run before the first request; it never becomes "unlimited".

## Environment and budget

| Item | 2026-10-31 SQLite-era run |
| --- | --- |
| Commit | `8c10a07` |
| Artifact | production `next build`, started with `next start` |
| Storage | disposable SQLite WAL file |
| Upstream | local OpenAI-shaped fixture; no real account, key, network or spend |
| Serving cap | 8 concurrent, 6000 configured RPM (fixture reports no RPM) |
| Fixture latency | 25 ms JSON delay; streams paced by frame |
| Offered budget | 387 calls, under the 500-call ceiling |
| Run window | bounded; the measured steady/ramp phases complete in seconds |

The fixture is deliberately separate from the HTTP suite catalog. It publishes a
subscription quota but no upstream RPM, so the configured fallback is the only
serving ceiling. No real provider request is made.

## Workloads and results

### Ramp

Each level offered 24 paid JSON requests. Levels up to the serving concurrency
must admit every request; the level above it must shed with provider-scoped 429,
not 5xx or silent loss.

| Concurrency | Dispatched / offered | Refused | p95 | Admitted rps |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 24 / 24 | 0 | 16.58 ms | 53.63 |
| 2 | 24 / 24 | 0 | 127.23 ms | 119.13 |
| 4 | 24 / 24 | 0 | 12.68 ms | 392.71 |
| 8 | 24 / 24 | 0 | 138.88 ms | 133.72 |
| 16 | 9 / 24 | 15 | 45.77 ms | 167.97 |

All ramp dispatches settled; there were no unexpected statuses. The level-16
refusals were 429 with `x-ratelimit-scope: provider`.

### Steady and burst

| Phase | Offered | Result | p50 / p95 / p99 | Throughput |
| --- | ---: | --- | --- | ---: |
| Steady, 8 concurrent | 120 | 120 × 200, all settled | 17.36 / 137.53 / 143.49 ms | 229.84 admitted rps |
| Burst, 24 concurrent | 48 | 16 × 200, 32 × 429, all settled | 36.35 / 166.41 / 166.64 ms | 16 dispatched |

Burst refusals were provider-scoped 429. No 5xx, no missing usage row and no
unresolved settlement. A saturated run is not allowed to look healthy by
rejecting everything: the steady phase independently required ≥99% admission,
and the burst phase required a real admitted floor.

### Streams, mixed billing and reservations

- **Long streams:** 16/16 completed with `[DONE]`, 16/16 settled, p95 431.14 ms.
- **Client cancellations:** 8/8 cancelled after the first bytes, 8/8 settled
  once as `cancelled`, no unresolved settlement.
- **Mixed billing:** 24/24 admitted, 12 `free` usage rows and 12 `credit` rows;
  free calls charged 0 micros; every dispatch settled.
- **Competing reservations:** 16 concurrent calls against 500 micros admitted
  exactly 2 and refused 14 with 402. Final balance was 100 micros, held 0, with
  no overdraft. The probe's prompt estimate was sized to cover actual usage;
  the documented actual-over-estimate overrun is a different condition and not
  what this check measures.
- **Key churn:** 12 concurrent creations from a 1-key account produced 9 × 201
  and 3 × 429; all 9 new keys were revoked, leaving 1 active key.

### Faults

Each fault ran twice. Every dispatched call produced exactly one committed
settlement and one usage row.

| Fault | Gateway result | Usage | Charge |
| --- | --- | --- | --- |
| Provider 429 | 429 | error | 0 |
| Provider 500 | 502 | error | 0 |
| Malformed JSON 200 | 502 | error | 0 |
| Provider disconnect | 502 | error | 0 |
| Slow provider (250 ms) | 200 | ok | normal |
| Truncated stream without `[DONE]` | 200 headers, stream error, no `[DONE]` | error | estimated partial usage |

The truncated-stream case found and repaired a real defect: a clean upstream
close without the protocol terminator used to settle as `ok`. The gateway now
settles it as `error`, does not forward `[DONE]`, and releases the admission
slot. The HTTP gate carries four regression checks for this path.

Other injected conditions:

- **Quota reset:** current 200, expired-reset 503, recovered 200, then a free
  call 200 with `billing_source: free` and 0 charge.
- **Database contention:** a second connection held an immediate write lock;
  the gateway waited and settled in 390 ms rather than failing or double-writing.
- **Alert failure:** the monitor exited 1 after one failed delivery, recorded
  `delivery_state: failed`, and stored a URL-redacted error.
- **Drain:** four streams were in flight; drain returned 200, a new call was
  refused 503 with `Retry-After: 30` and created no usage/hold/settlement, all
  four streams completed and settled, and resume accepted the next call.
- **Process crash:** four in-flight streams were killed with the process. After
  restart, four settlements and four holds remained; no usage or debit was
  duplicated. Expiring the holds produced four explicit quarantines while
  keeping the reserved credit.
- **Storage write failure:** the usage INSERT was rejected (status 500), leaving
  one admitted settlement and one hold, no usage and no debit. Expiry produced
  exactly one explicit quarantine. **ENOSPC was not reproduced**: this injects
  the same durable rollback/quarantine path, not a full volume.

## Reconciliation

| Invariant | Result |
| --- | --- |
| Admitted calls left unresolved | 0 |
| Committed settlements | 310 |
| Usage rows | 310 |
| Committed-without-usage mismatch | 0 |
| Quarantined holds | 5 (4 crash + 1 storage failure) |
| Ledger difference | 0 micros |
| Held-vs-reservation difference | 0 micros |
| Accounts with negative credit | 0 |
| SQLite `integrity_check` | ok |
| Billing sources | 297 credit, 13 free |
| Usage statuses | 292 ok, 10 error, 8 cancelled |
| Peak server RSS | 186.7 MB |
| Database bytes | 5,074,712 |

The 10 error rows are the provider/malformed/disconnect/truncated faults. The 8
cancelled rows are client disconnects, not failed settlements.

## Measured envelope

- **Sustained admitted throughput:** 229.84 rps at 8 concurrent, 99.9%+ admission
  and p95 137.53 ms on this disposable host.
- **Peak short ramp:** 392.71 rps at 4 concurrent over 24 requests; this is a
  burst sample, not the sustained cap.
- **Candidate safe cap:** `229.84 × 0.7 = 160.89 rps`. The 30% headroom is a
  candidate policy, not an operator ruling.
- **Bottleneck:** the serving-provider concurrency limit (8) causes burst
  shedding; SQLite write serialization and Node scheduling bound sustained
  throughput and drive the p95 tail.
- **Resources:** 186.7 MB peak RSS and 5.1 MB database. Both are far below the
  512 MB / 256 MB candidate budgets, but this is a small fixture database, not a
  production-sized one.

Do **not** publish the 160.89 rps figure as supported capacity. It is a local
mock measurement with no operator approval and no real upstream contract.

## No-go conditions

A run fails, and the candidate envelope is not accepted, on any of:

- a dispatch without a committed settlement or explicit quarantine;
- a committed settlement without one usage row, or a ledger/held difference;
- negative fixture credit (outside a deliberately measured overrun case);
- a PostgreSQL integrity failure (an unvalidated foreign key or a
  reconciliation mismatch);
- an unexpected status, a 5xx under steady/ramp/mixed, or a refusal without
  `Retry-After`/provider scope where applicable;
- steady admission below 99%, sustained throughput below 20 rps, p95 above
  1500 ms or p99 above 3000 ms;
- peak RSS above 512 MB or database above 256 MB;
- more than 4 crash quarantines, more than 5 total quarantines, or any
  unexpected admitted row;
- a database, alert, drain, crash or storage-write path that loses its
  reservation or hides its failure;
- a missing resource measurement. "Unmeasured" is a failure, never a pass.

## Boundaries

Local evidence covers the real production route handlers, the real gateway
admission/settlement code, real PostgreSQL transactions, real SSE relay and real
process restart. It does **not** cover:

- a real upstream provider, its 15 RPM/account behavior, real latency or spend;
- the selected Fly volume, a production-sized database or ENOSPC;
- the 120 s JSON / 300 s stream deadlines (disconnect and truncation are
  covered instead);
- hosted TLS ingress, proxy buffering, timeouts or a CDN;
- operator approval of a traffic cap or the initial cohort/spend limit.

`FID-2026-1030-060-LIVE` stays blocked until the operator approves the envelope
and the same run is repeated on the production-equivalent host with a funded,
authorized provider budget and a recorded receipt. Until then, the cap is a
candidate for review, not a promise.
