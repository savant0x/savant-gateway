# Current project status

**Newer review:** [2026-11-04 release audit](../dev/audits/2026-11-04-release-readiness.md)
records the current quality checks, repaired guard/ledger defects, remaining
release conditions and ranked engagement/QOL proposals. The dated tables below
remain the 2026-11-03 index and do not supersede that audit.

**Index date: 2026-11-03.** This page is a dated index, not a receipt. Each claim
links to the record that owns it; a record can be newer than this page. The
previous index is preserved as [the 2026-10-31 record](project-status-2026-10-31.md).

## Where the truth lives

| Question | Authoritative record |
| --- | --- |
| What changed, with evidence and limitations? | [`CHANGELOG.md`](../CHANGELOG.md) |
| What work is active, converged or closed? | [`dev/fids/README.md`](../dev/fids/README.md) |
| What must a release prove? | [FID-2026-1030-043](../dev/fids/FID-2026-1030-043-launch-master.md) and [FID-2026-1030-062](../dev/fids/FID-2026-1030-062-launch-acceptance-and-rollout.md) |
| What has the operator authorized? | [launch-decision-form.md](launch-decision-form.md) |
| How is real acceptance recorded? | [launch-receipt.md](launch-receipt.md) |
| How is the app installed and deployed? | [getting-started.md](getting-started.md), [README](../README.md) |

## Verification — 2026-11-03

Measured locally against the working tree at `a789b94` plus this documentation
slice, on Windows with Node 24:

| Gate | Result |
| --- | --- |
| `npm run check` (lint + typecheck) | PASS |
| `npm test` | 959 tests: 958 pass, 0 fail, 1 skipped |
| `npm run quality` | PASS (400-line ceiling) |
| `npm run build` | PASS |
| `npm run test:http` | 776 checks PASS; the trial suite requires a real PostgreSQL endpoint |
| `npm run test:recovery` | PASS (dump, restore, replay and refusals) |
| `npm run test:postgres` | PASS — disposable PostgreSQL 18.6 on loopback: 1/1, 0 skipped; exactly one of two racing debits committed. Plain `npm test` still skips this case when `TEST_DATABASE_URL` is unset. |
| `npm run test:load` | Real PostgreSQL 17.11 on an isolated database in the configured Supabase cluster (pooler port 6543). Every workload and the ledger reconciliation ran; five candidate targets failed (4.76 admitted rps, steady p95 1,974ms, two mixed-billing 503s). FID-148 closes the port; capacity acceptance remains open under FID-062, and the envelope stays a candidate. |

The Vercel production deployment reached Ready on `67551ea`; `/api/ready`
reports PostgreSQL storage healthy, and the 2026-11-03 cutover receipt records
44 models and 16 content sources. That is deployment evidence, not launch
acceptance: none of the external items below has been observed.

## Active queue

| ID | Status | Open obligation |
| --- | --- | --- |
| [043](../dev/fids/FID-2026-1030-043-launch-master.md) | converged | Launch remains **no-go**. Owns the dependency register and the operator decision. |
| [062](../dev/fids/FID-2026-1030-062-launch-acceptance-and-rollout.md) | converged | Items 1–8: real NOWPayments invoice/signed IPN/replay refusal, funded paid inference, hosted restore, delivered alert, PostgreSQL load envelope, published `v1.2` policies, hosted restore/retention confirmation, explicit public GO. |
| [068](../dev/fids/FID-2026-1030-068-usdc-receive-lane.md) | fixed | Direct USDC lane: chain/token contract, hardware-wallet xpub, RPC endpoint and screening ruling. Not a launch path. |
| [127](../dev/fids/FID-2026-1103-127-real-launch-acceptance-receipt.md) | fixed | `npm run receipt:launch` reports INCOMPLETE until the operator records all six observations and a go decision pinned to the release SHA. |
| [137](../dev/fids/FID-2026-1103-137-product-hardening-and-install-order-master.md) | converged | Sequencing register; closes only after 126 and 127 have their evidence. |

The free/paid SKU split, content sources, Signal engagement work and the pricing
console are implemented and covered by the gates above. They are public product
behavior, not payment or launch acceptance.

## Recently closed

FIDs 126, 128–136, 141, 148 and the 2026-11-02 content/catalog queue moved
through the Perfection Loop into commits `4b57ebe`, `8bb2d20`, `d701ce6`,
`35c1d35` and `a789b94`; their closed records and evidence are under
[`dev/fids/archive/`](../dev/fids/archive/). FID-148 closes the load-gate port
only; the failed capacity targets are still owned by FID-062. FID 127 remains
active because the operator receipt does not exist yet. The dated receipts
in [the 2026-10-31 record](project-status-2026-10-31.md) remain historical
evidence and are not a claim about today's tree.
