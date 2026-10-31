# Project status and navigation

As of 2026-10-31. This is the current index; dated session receipts describe the
tree they tested, not automatically the current working tree.

Latest implementation: [FID-2026-1030-058](../dev/fids/archive/FID-2026-1030-058-database-backup-and-restore.md),
closed against `2dc005e`, adds a checksummed online
backup, an isolated restore verifier and a real-server recovery drill. The
operator RPO/RTO and first production-volume restore remain blocked as
`FID-2026-1030-058-LIVE`. The
[runbook](deployment-runbook.md#backup-and-restore) separates code evidence from
that live acceptance.

Latest repair: [FID-2026-1031-071](../dev/fids/archive/FID-2026-1031-071-fid-ledger-integrity.md),
closed against `d991967`, corrects the active ledger:
active 063/064/065 are now 072/073/074, six non-canonical statuses are
normalized, 067 and the three renumbered records are archived, 068 is
registered, and the tracking ledger exists. No application code changed. The
prior provider-account repair
([FID-2026-1030-063](../dev/fids/archive/FID-2026-1030-063-provider-account-truth.md),
`d31d9e0`) remains the current account-truth implementation: every explicit check
reads upstream, failure reports unavailable, and the one-time trial switch stays
off. The supplied APInex email identifies the master-account pool as an
integration sandbox and commercial production as PAYG; exact terms/rates/funding
remain open.

## Start here

| Question | Authority |
| --- | --- |
| How is work governed? | [Single-agent ECHO](../dev/echo-v0.1.2-single-agent.md), [configuration](../protocol.config.yaml) |
| What is approved now? | [SCOPE](../SCOPE.md), current launch-FID planning section P1–P4 |
| What must happen before launch? | [Launch plan](launch-plan.md) |
| What organizes all launch work? | [Master FID 043](../dev/fids/FID-2026-1030-043-launch-master.md), children 044–062, plus supplemental 066–068 |
| What has actually been examined? | [Systems review](../dev/audits/2026-10-30-systems-review.md) |
| What can honestly be offered now? | [Offering evidence ledger](offering-evidence.md) |
| What changed? | [CHANGELOG](../CHANGELOG.md), then the implementation commit |
| What should implementation preserve? | [Knowledge](../knowledge.md) |
| Where is the session handoff? | [Database recovery](../dev/session-summaries/2026-10-31-database-recovery.md), [FID ledger integrity](../dev/session-summaries/2026-10-31-fid-ledger-integrity.md) |

## Product state

Implemented: provider registry/sync, OpenAI-compatible Chat Completions with JSON
and streaming, OpenAI/Anthropic upstream adapters, customer accounts and scoped
keys, integer-micro-dollar pricing, credit holds/ledger/settlement, Stripe
webhook fulfillment, subscription snapshots/allowances, admin control plane,
revenue/cost analytics, daily free allocation and a shared free rate bucket.

Recent additions, committed as `50758c1`: stored Artificial Analysis benchmarks and admin
sync controls, side-by-side model comparison, catalog/brand refinements, and
browser-local timestamp display. A committed implementation is not real service
or launch acceptance. The verification receipt records what was exercised.

Customer policies `v1.1` are published and effective 2026-10-30 at `/terms`,
`/privacy`, `/refunds` and `/acceptable-use`, with `/legal/v1.1/<slug>` and the
superseded `/legal/v1/<slug>` both permanent. Acceptance is enforced at signup,
prompted per version for existing accounts, and stored in `policy_acceptances`.
v1.1 corrects two v1 statements: tax is not calculated or collected, because the
checkout session never enables it, and the operator is not a registered entity,
so no address is printed and a postal address is offered on request. The only
open item is that no lawyer reviewed the text; the operator accepted that.

Packaging and host decision: FID-067 is closed against `1081362`; the repository
carries a single-container Fly artifact, but no app, volume, secret or machine
exists and deployment is operator-deferred. The libSQL port is not proceeding
(FID-066, D6): one persistent Node process on one local volume is the selected
topology. The USDC receive lane has an offline step-0 proof (`b2790d1`, FID-068)
and is blocked on the operator's chain/token, xpub, RPC and screening inputs; no
money path or schema is implemented.

## Offering decisions

- Lifetime trial activation stays off. Email verification delivery is absent;
  the implemented grant path requires a verified email. Pair mapping and grant
  budget must also be explicitly configured before activation.
- Subscription implementation stays; no plans are sold at launch under the
  [recorded decision](subscriptions-decision.md).
- Daily shared free access is the currently implemented active path. Whether it
  remains the public launch offering or gives way to the proposed lifetime
  trial is an explicit operator decision before public copy is frozen.
- Paid credit infrastructure exists. Real hosted payment and funded paid
  inference acceptance remain launch gates, not completed customer journeys.

## Evidence boundaries

Launch planning session baseline: `b0b65ac`. Master 043 and nineteen children
044–062 cover A–Z requirements and passed individual document Perfection Loops.
As of 2026-10-31 the active queue is thirteen records: 043–046, 049, 056–057,
059–062, 066 and 068. FID-047, 048, 050–055, 058, 063 (provider truth), 064 (CI
race), 067, 069, 070, 071, 072, 073 and 074 are archived closed. 056/057/061 are
`fixed` with residual gates; 066 is a dormant converged decision record; 068 is
converged with its implementation steps blocked on operator inputs. Authoring/
audit is complete; implementation and live acceptance are not. The
[audit receipt](../dev/audits/2026-10-30-launch-fid-perfection-loop.md) records
source/dependency/test checks, measured revisions, two stable passes and hashes.

Launch implementation began 2026-10-30 with the two independent starters. FID-047
is closed against `2ef2d74`: one redaction policy now covers logs, usage errors,
provider runtime rows and benchmark attempts; provider URLs reject embedded
credentials; provider redirects are not followed; login guessing is bounded per
account; and `SECURITY.md` describes the real guards. FID-044 remains converged
with its [offering evidence ledger](offering-evidence.md): the economics and
unknown inputs are recorded, activation stays closed, and closure waits on dated
operator rulings. Neither implementation activates an offering, funds a wallet,
sells a plan or deploys.

The following initial-state narrative belongs to the preceding housekeeping pass:

Initial session HEAD: `443cde5`. The local `origin/main` reference is not proof
of current remote state. At intake there were 18 local commits beyond that
reference and substantial uncommitted work. Local-only runtime state and
research are preserved; none is automatically staged with product code.

Fresh verification reports 209 passing unit tests and clean lint/typecheck/
quality/build. The expanded HTTP suite exercises request roots, paid SSE,
injected write failure and cancellation. Both HTTP suites are required by
`npm run verify`; exact final counts and commands are in the current session.

FID-020–029 closure was reconciled against implementation history and fresh
gates. FID-033–040 were labelled closed without commits; their metadata was
corrected, the implementation committed, and closure tied to `50758c1`.
The dated reconciliation entries supersede historical closure prose.

## Operator-controlled launch gates

Funding and credentials near launch remain governed by the operator's recorded
2026-10-29 instruction in [launch readiness](launch-readiness.md). The full
launch plan names decisions, prerequisite implementations and acceptance
evidence. It does not authorize activating trials, selling subscriptions,
funding an upstream wallet, or deploying the product.
