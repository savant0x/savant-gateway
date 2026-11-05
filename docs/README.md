# Documentation index

This directory mixes current operating docs, dated decision records and research.
The label matters: a historical document describes the tree it was written
against, not automatically today's behavior.

## Start here

| Need | Read |
| --- | --- |
| Run the app locally and make the first request | [getting-started.md](getting-started.md) |
| Learn the product as a customer | `/docs/start`, `/docs/faq` in the running app |
| Operate the admin console for the first time | [operator-first-run.md](operator-first-run.md) |
| Fix a setup, gate or deployment failure | [troubleshooting.md](troubleshooting.md) |
| Know what is verified and what is blocked | [project-status.md](project-status.md) |
| Record real launch acceptance | [launch-receipt.md](launch-receipt.md) |
| See the path to launch | [launch-plan.md](launch-plan.md) |
| Answer the open launch decisions | [launch-decision-form.md](launch-decision-form.md) |
| Deploy on Vercel with PostgreSQL | [../README.md](../README.md#deploying-on-vercel) |
| Read the superseded SQLite/Fly runbook | [deployment-runbook.md](deployment-runbook.md) |
| Understand the earlier hosting decision | [hosting-decision.md](hosting-decision.md) |
| Handle a support or deletion request | [support-runbook.md](support-runbook.md) |
| Configure alerts, pause admission and respond to incidents | [operations-runbook.md](operations-runbook.md) |
| Schedule and verify content source fetching | [content-scheduler.md](content-scheduler.md) |
| Measure capacity and rehearse load/failure recovery | [load-acceptance.md](load-acceptance.md) |
| Configure verification and password recovery | [account-email.md](account-email.md) |
| Change or publish a policy | [policies/README.md](policies/README.md) |
| Review the commercial model and evidence | [business-model.md](business-model.md), [offering-evidence.md](offering-evidence.md) |

## Customer-facing documentation

These pages are served by the application, not kept as files in this directory.
They describe behavior the code performs and are checked by the HTTP gate.

| Route | Source | Covers |
| --- | --- | --- |
| `/docs` | [api-reference.tsx](../components/docs/api-reference.tsx) | Authentication, catalog vocabulary, the chat contract and the error envelope. |
| `/docs/start` | [newcomer-guide.tsx](../components/docs/newcomer-guide.tsx) | Account, key, billing group, first request, first bill and common failures. |
| `/docs/faq` | [faq.tsx](../components/docs/faq.tsx), [faq-data.ts](../components/docs/faq-data.ts) | Access, models, billing, limits, privacy and support questions. |

The site header, footer, account header, account page, support page and landing
quick start link into these pages. When behavior changes, update the page and its
HTTP check together; do not let a docs page promise a route the gateway does not
serve.

`/sitemap.xml` and `/robots.txt` come from [sitemap.ts](../app/sitemap.ts) and
[robots.ts](../app/robots.ts). They render per request from
`NEXT_PUBLIC_SITE_URL`; the FAQ page's structured data comes from
[faq-jsonld.tsx](../components/docs/faq-jsonld.tsx) and is generated from the
same answer data the page renders.

## Current references

- [project-status.md](project-status.md) — dated index of the current tree,
  verification receipt, active queue and launch blockers.
- [launch-receipt.md](launch-receipt.md) — the operator-authored hosted
  acceptance receipt, its evidence fields and redaction rules.
- [launch-plan.md](launch-plan.md) — phase-by-phase launch gates and owners.
- [getting-started.md](getting-started.md) — install, environment, provider sync,
  first customer key and first gateway call. The customer-facing path is
  `/docs/start`; this file is the operator and contributor path.
- [operator-first-run.md](operator-first-run.md) — provider, catalog, credit,
  reconciliation, support and policy tasks.
- [deployment-runbook.md](deployment-runbook.md) — historical SQLite/Fly
  runbook, superseded 2026-11-02 by Vercel + PostgreSQL.
- [troubleshooting.md](troubleshooting.md) — empty catalog, config codes, Stripe
  503, gate prerequisites, native SQLite and Fly CLI failures.
- [hosting-decision.md](hosting-decision.md) — historical hosting decision
  record from before the PostgreSQL cutover.
- [support-runbook.md](support-runbook.md) — support queue and manual deletion.
- [operations-runbook.md](operations-runbook.md) — scheduled monitor, alert
  webhook and signature, incident dedup/retry, and pause/drain/provider controls.
- [content-scheduler.md](content-scheduler.md) — authenticated GET/POST content
  heartbeat, supported scheduler options, policy controls and the activation
  receipt, including the Vercel plan limitation.
- [providers.md](providers.md) — register an upstream, price it, and how the
  cheapest-provider routing and stable published ids work.
- [research/apixo-provider-review.md](research/apixo-provider-review.md) —
  verified Apixo API, image catalog, resale economics and the onboarding gaps.
- [research/aio-source-review.md](research/aio-source-review.md) — static review
  of the ten identity/fingerprint reference repositories, corrections to the
  Gemini research report, and the operator-scoped AIO architecture and build
  path: admin-run, advisory, free-pool first, API-only, user-funded runs
  optional. Proposal only; no application code.
- [research/aggronation-sources.md](research/aggronation-sources.md) — the
  sources recoverable from the retired aggroNATION repository, mapped to
  Savant's RSS, YouTube, HuggingFace, and Trendshift kinds with live parser
  probes, the one-click preset path, optional GitHub repo enrichment, and the
  separate list of YouTube channels that need an old Supabase export.
- [load-acceptance.md](load-acceptance.md) — bounded load/fault gate, candidate
  envelope, measured throughput/latency/resources, reconciliation and the
  operator-approval boundary.
- [upstream-speed-probe.md](upstream-speed-probe.md) — one-day real-upstream
  TTFT, throughput and 429 measurement, the first free-pool snapshot, and the
  funded paid-comparison blocker.
- [policies/README.md](policies/README.md) — policy versions `v1.1` (current) and
  `v1` (superseded, still readable).
- [echo-protocol.md](echo-protocol.md) — short orientation to the governing
  single-agent protocol.
- [../SECURITY.md](../SECURITY.md) — threat model and secret handling.

## Research, decisions and evidence

These files are inputs or dated decisions, not current procedure. A prompt is
not an implementation authorization and a decision record is not a receipt.

- [business-plan-research-prompt.md](business-plan-research-prompt.md) —
  external research prompt for an early-stage business plan.
- [content-integration-research-prompt.md](content-integration-research-prompt.md)
  — external research prompt for the content-to-commerce surface.
- [model-identity-research-prompt.md](model-identity-research-prompt.md) —
  external research prompt for model identity; not an implementation plan.
- [crypto-payments-decision.md](crypto-payments-decision.md) — dated decision
  record; the direct-to-wallet lane still depends on operator inputs.
- [subscriptions-decision.md](subscriptions-decision.md) — 2026-10-29 decision
  record; plans are implemented but were not offered at that date.
- [trial-conversion-contract.md](trial-conversion-contract.md) — disabled trial
  implementation contract from 2026-10-29.
- [trial-system-audit.md](trial-system-audit.md) — 2026-10-29 audit of the trial
  ledger; historical state, not a current receipt.
- [release-audit-answers.md](release-audit-answers.md) — operator fill-in sheet
  for the 2026-11-04 release-audit questions.

## Historical records

These are kept for the decision trail. Do not follow them as current procedure
without checking the selected topology and open gates.

- [project-status-2026-10-31.md](project-status-2026-10-31.md) — the dated
  2026-10-31 state and receipts, superseded as the current index.
- [database-options.md](database-options.md) — remote-database research,
  superseded 2026-10-30 by the Fly decision.
- [launch-readiness.md](launch-readiness.md) — 2026-10-29 prerequisite inventory;
  the launch plan is the current execution order.
- `dev/audits/` and `dev/session-summaries/` — dated review and handoff receipts.
- `dev/fids/archive/` — closed FID records; live acceptance gaps may remain and
  are tracked in `dev/tracking/internal-followups.json`.

## Documentation rules

- A current doc must describe behavior the code performs. If a claim is not
  verified, name it as a limitation.
- A superseded decision gets a banner and a date, not a silent rewrite.
- Policy text is immutable once published; a correction is a new version.
- Commands in docs must match `package.json`, the pre-push hook and CI.
