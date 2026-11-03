# Current project status

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

Measured locally against the working tree at `d701ce6` plus the FID-135/127
documentation slice, on Windows with Node 24:

| Gate | Result |
| --- | --- |
| `npm run check` (lint + typecheck) | PASS |
| `npm test` | 959 tests: 958 pass, 0 fail, 1 skipped |
| `npm run quality` | PASS (400-line ceiling) |
| `npm run build` | PASS |
| `npm run test:http` | 776 checks PASS; the trial suite requires a real PostgreSQL endpoint |
| `npm run test:recovery` | PASS (dump, restore, replay and refusals) |
| `npm run test:postgres` | PASS — disposable PostgreSQL 18.6 on loopback: 1/1, 0 skipped; exactly one of two racing debits committed. Plain `npm test` still skips this case when `TEST_DATABASE_URL` is unset. |
| `npm run test:load` | ported to PostgreSQL (FID-148). A PGlite wire smoke passed every workload except the lock-based contention check; the real-PostgreSQL measurement is blocked on this host (no Docker engine, no WSL2). The envelope remains a candidate, not approved capacity. |

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
| [148](../dev/fids/FID-2026-1103-148-postgres-load-acceptance.md) | converged | Port complete. The accepted `test:load` receipt needs a Docker-capable host with `TEST_DATABASE_URL`; the smoke run leaves one lock-contention check unproven. |

The free/paid SKU split, content sources, Signal engagement work and the pricing
console are implemented and covered by the gates above. They are public product
behavior, not payment or launch acceptance.

## Recently closed

FIDs 126, 128–136, 141 and the 2026-11-02 content/catalog queue moved through
the Perfection Loop into commits `4b57ebe`, `8bb2d20`, `d701ce6` and `35c1d35`;
their closed records and evidence are under
[`dev/fids/archive/`](../dev/fids/archive/). FID 127 remains active because the
operator receipt does not exist yet. The dated receipts
in [the 2026-10-31 record](project-status-2026-10-31.md) remain historical
evidence and are not a claim about today's tree.
