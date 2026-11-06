# Current project status

**Index date: 2026-11-06.** This page is a dated index, not a receipt. Each claim
links to the record that owns it; a record can be newer than this page. The
previous index is preserved as [the 2026-10-31 record](project-status-2026-10-31.md).

**Current evidence:** [`CHANGELOG.md`](../CHANGELOG.md) and the
[`dev/fids/README.md`](../dev/fids/README.md) register. The earlier
[2026-11-04 release audit](../dev/audits/2026-11-04-release-readiness.md)
remains the dated release review.

## Where the truth lives

| Question | Authoritative record |
| --- | --- |
| What changed, with evidence and limitations? | [`CHANGELOG.md`](../CHANGELOG.md) |
| What work is active, converged or closed? | [`dev/fids/README.md`](../dev/fids/README.md) |
| What must a release prove? | [FID-2026-1030-043](../dev/fids/FID-2026-1030-043-launch-master.md) and [FID-2026-1030-062](../dev/fids/FID-2026-1030-062-launch-acceptance-and-rollout.md) |
| What has the operator authorized? | [launch-decision-form.md](launch-decision-form.md) |
| How is real acceptance recorded? | [launch-receipt.md](launch-receipt.md) |
| How is the app installed and deployed? | [getting-started.md](getting-started.md), [README](../README.md) |

## Verification — 2026-11-06 (FID-013 closure)

`npm run verify` PASS on the 013B tree — 12/12 gates, 1,123/1,123 tests with
zero skips, mandatory PostgreSQL 20/20, browser 4/4, 758 main HTTP checks plus
the trial suite, recovery 15/15, quality 687 files, build PASS and 177.7 s.
`npm run check` exits 0. Implementation commits: `a73960f` (013A), `4009b21`
(013A browser/durability) and `de4dfbc` (013B OpenRouter lane, `/3` backup and
gate hardening). No real source publication, funded inference, payment or
deployment is claimed.

## Verification — 2026-11-05 (FID-009 closure)

Measured locally on Windows x64 with Node 24.21.0. The closure run is based on
implementation commit `0052734`; the pre-push hook repeats it on the pushed tree:

| Gate | Result |
| --- | --- |
| `npm run verify` | PASS — 11/11 gates, 132.9 s; summary in `.verify/summary.json` |
| `npm run check` (lint + typecheck) | PASS |
| `npm test` | 1,046/1,046 tests, 0 failed, 0 skipped |
| `npm run test:postgres` | PASS — seven assertions across the four declared files, 0 skipped, on the pinned native PostgreSQL 17.11.0-beta.19. The verifier summary's `2/2` is the first test file's total. |
| `npm run test:http` | PASS — 776 main checks plus the trial suite, both on real PostgreSQL |
| `npm run test:recovery` | PASS — 14/14 dump, restore, replay and refusal checks |
| `tests/disposable-postgres.test.mjs` | PASS — 9/9 lifecycle and refusal tests |
| `npm run quality` | PASS (400-line ceiling) |
| `npm run build` | PASS |
| `npm run test:load` | **Not run in this pass.** Capacity acceptance and the candidate envelope remain open under FID-2026-1030-062. |

The separate browser receipt passes 12/12 journey checks on build
`IbsGZjBu7Q51HrQ3KPfsT` at implementation commit `0052734`, using Microsoft Edge
via Playwright. It is a manual release measurement, not part of `verify`; the
receipt is [`dev/audits/2026-11-05-browser-matrix-009.md`](../dev/audits/2026-11-05-browser-matrix-009.md).

The gate stack is Docker-free. With `TEST_DATABASE_URL` unset, `verify` starts
one pinned native PostgreSQL 17 cluster under ignored `.scratch/postgres`, binds
it to loopback on an ephemeral port, supplies both test URLs, and removes only
its own marked directory. CI declares no container service, and the obsolete
container and Fly packaging is removed. Linux CI, a clean install with
postinstall scripts enabled, the load gate and hosted delivery were not
observed in this pass; the archived FID-2026-1105-002 records those limits.

The Vercel deployment last observed Ready on `67551ea`; `/api/ready` reported
PostgreSQL storage healthy, and the 2026-11-03 cutover receipt records 44 models
and 16 content sources. That is historical deployment evidence, not launch
acceptance. None of the external items below has been observed on this tree, and
no hosted re-observation is claimed here.

## Active queue

Twelve records are active. The [register](../dev/fids/README.md) owns the exact
next action and evidence edges; this table is the current summary.

| ID | Status | Open obligation |
| --- | --- | --- |
| [2026-1105-003](../dev/fids/FID-2026-1105-003-router-cheap-provider.md) | fixed | Implementation committed at `6cdfc80`; archive after closure acceptance. No paid inference or reseller management write. |
| [2026-1105-004](../dev/fids/FID-2026-1105-004-scheduled-provider-sync.md) | fixed | Deployed at `https://savant-gateway.vercel.app` (`dpl_53PM1vwqGkVk61xzaCWXfruwL2CC`); `CRON_SECRET` set; unauth `401`, auth and Vercel-triggered run `200` (nothing due). First scheduled run and a due-provider refresh not yet observed. |
| [043](../dev/fids/FID-2026-1030-043-launch-master.md) | converged | Launch remains **no-go**. Owns the dependency register and the operator decision. |
| [062](../dev/fids/FID-2026-1030-062-launch-acceptance-and-rollout.md) | converged | Items 1–8: real NOWPayments invoice/signed IPN/replay refusal, hosted restore, delivered alert, PostgreSQL load envelope, published `v1.2` policies, hosted retention confirmation, explicit public GO. Funded paid inference was withdrawn on 2026-11-04 and remains unverified. |
| [068](../dev/fids/FID-2026-1030-068-usdc-receive-lane.md) | fixed | Direct USDC lane: chain/token contract, hardware-wallet xpub, RPC endpoint and screening ruling. Not a launch path. |
| [127](../dev/fids/FID-2026-1103-127-real-launch-acceptance-receipt.md) | fixed | `npm run receipt:launch` reports INCOMPLETE until the operator records the five required observations (`payment`, `recovery`, `alert`, `load`, `rollback`) and a go decision pinned to the release SHA. |
| [137](../dev/fids/FID-2026-1103-137-product-hardening-and-install-order-master.md) | converged | Sequencing register; closes only after FID-127 has its operator evidence. FID-126 is already closed. |
| [011](../dev/fids/FID-2026-1104-011-policy-v1-2-publication.md) | converged | Operator approves the recipient inventory; draft and publish policy `v1.2` with the acceptance bump. |
| [015](../dev/fids/FID-2026-1104-015-content-fetch-automation-and-history.md) | converged | Planning only; coding is reserved and the scheduler backend is unconfirmed. |
| [016](../dev/fids/FID-2026-1104-016-persistent-content-model-decisions.md) | converged | Planning only; accepted links must remain attached across automatic work. |
| [017](../dev/fids/FID-2026-1104-017-content-matching-controls-and-review.md) | converged | Implement after 015 and 016; management, settings and rematch are not shipped. |
| [018](../dev/fids/FID-2026-1104-018-content-automation-master.md) | converged | Planning handoff ready; no coding or hosted activation is authorized. |

The free/paid SKU split, content sources, Signal engagement work and the pricing
console are implemented and covered by the gates above. They are public product
behavior, not payment or launch acceptance.

## Recently closed

FIDs 126, 128–136, 141 and 148 and the 2026-11-02 content/catalog queue moved
through the Perfection Loop into commits `4b57ebe`, `8bb2d20`, `d701ce6`,
`35c1d35` and `a789b94`; their closed records and evidence are under
[`dev/fids/archive/`](../dev/fids/archive/). FID-148 closed the load-gate port
only; its failed capacity targets remain owned by FID-062.

On 2026-11-05, FID-2026-1105-001 closed at `84189f8` (YouTube description model
matching) and FID-2026-1105-002 closed at `a3ed2a1` (Docker-free native
PostgreSQL verification). The 002 closure includes the 11/11 gate run, the
native lifecycle suite, real-PostgreSQL concurrency and HTTP checks, and the
recovery drill; it does not claim Linux CI, a clean install with postinstall
scripts enabled, the load gate or hosted delivery.

FID-2026-1104-009 closed on 2026-11-05 at `0052734` with the 12/12 browser
receipt above. FID-2026-1104-013 closed on 2026-11-06 at `de4dfbc`: the browser
journey, mandatory PostgreSQL store wiring, showcase recovery assertions and
OpenRouter fixture are present and verified. The operator approved the MIT
source use; no external rights blocker remains.

FID-127 remains active because the operator receipt does not exist yet. The
dated receipts in [the 2026-10-31 record](project-status-2026-10-31.md) remain
historical evidence and are not a claim about today's tree.
