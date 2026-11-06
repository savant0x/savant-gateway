# Bounded load baseline — 2026-11-05

**Commit:** `efd8cb5db6744b99c763d6444504e3fa24657a9d`
**Build:** `IAM3O7lEMQpsmxODr2pu4`
**Command:** `node scripts/load-acceptance.mjs --json .scratch/load-012.json`
**Receipt:** `dev/receipts/2026-11-05-load-baseline/load-acceptance.json`
**SHA-256:** `13e3051090ec1239714ebdfe66484579f2ed7ce0959a51e88d0b5667d9e6fc63`
**Verdict:** PASS (candidate measurement; 123/123 checks, 0 failed)

## Scope

The gate booted a local production build, a disposable native PostgreSQL 17
cluster and the local provider double. It offered 387 calls from the candidate
envelope (`config/load-envelope.json`) and measured ramp, steady, burst, stream,
mixed-billing, reservation, key-churn and fault workloads. No real provider
request, funded inference, live payment or hosted deployment was involved.

The envelope status is `candidate` and `operatorApproval.approved` is `false`.
This is a repeatable local baseline, not accepted production capacity.

## Measured result

| Metric | Result |
| --- | --- |
| Steady admitted rate | 118.44 rps |
| Safe steady rate (0.7 headroom) | 82.91 rps |
| Peak ramp rate | 97.09 rps |
| Steady p95 / p99 | 175.36 ms / 188.50 ms |
| Ramp-1 p95 / p99 | 154.90 ms / 165.06 ms |
| Ramp-16 result | 17 of 24 dispatched; provider-scoped refusals |
| Burst | 19 admitted, 29 provider 429 refusals, 0 unexpected |
| Long streams | 16 dispatched, 16 settled |
| Client cancellations | 8 settled as cancelled |
| Mixed billing | 24 settled; 12 free and 12 credit |
| Competing reservations | 2 admitted from 500 micros, 14 refused, no overdraft |
| Peak server RSS | 225.7 MB |
| Database size | 12,727,987 bytes |
| Credit ledger difference | 0 micros |
| Held-credit difference | 0 micros |
| Usage rows | 303 ok, 10 error, 8 cancelled |
| Quarantine | 5 rows (4 crash, 1 injected storage failure) |
| Reconciliation | no negative balances, foreign keys ok |

The measured bottleneck is provider concurrency `8`; burst traffic is refused
with provider-scoped 429 rather than a 5xx or a dropped settlement. The free-pool
policy read back before traffic matched the envelope exactly: enabled, 20,000,000
daily weighted tokens, 9,000 bps allocation, 100,000 per-account cap.

## Faults and recovery

The run exercised provider 429/500, malformed JSON, disconnect, slow and
truncated streams; database writer contention; alert delivery failure; drain;
process crash; and an injected usage-INSERT failure. Each admitted call either
settled once or remained an explicit quarantine; no second debit and no
unresolved admitted call was reported. Drain refused new work with 503 and
`Retry-After: 30` while four streams finished.

## Limitations

- The upstream is a local fixture; real provider latency, quota and budget are
  not measured.
- PostgreSQL is disposable, not the production host or a production-sized data
  set.
- ENOSPC was not reproduced; a storage-write rejection was injected at the usage
  INSERT.
- The 120 s JSON and 300 s stream provider deadlines were not waited out.
- No hosted proxy, TLS ingress or CDN behavior is exercised.
- The candidate envelope has no dated operator approval. Hosted acceptance and
  the release decision remain FID-2026-1030-060-LIVE / FID-2026-1103-127.
