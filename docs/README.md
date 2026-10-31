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
| See the path to launch | [launch-plan.md](launch-plan.md) |
| Deploy, back up, restore and roll back | [deployment-runbook.md](deployment-runbook.md) |
| Understand the hosting decision | [hosting-decision.md](hosting-decision.md) |
| Handle a support or deletion request | [support-runbook.md](support-runbook.md) |
| Change or publish a policy | [policies/README.md](policies/README.md) |

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

- [project-status.md](project-status.md) — verified state, evidence boundaries and
  the active launch queue.
- [launch-plan.md](launch-plan.md) — phase-by-phase launch gates and owners.
- [getting-started.md](getting-started.md) — install, environment, provider sync,
  first customer key and first gateway call. The customer-facing path is
  `/docs/start`; this file is the operator and contributor path.
- [operator-first-run.md](operator-first-run.md) — provider, catalog, credit,
  reconciliation, support and policy tasks.
- [deployment-runbook.md](deployment-runbook.md) — runtime contract, Fly
  procedure, health checks, backup/restore, RPO/RTO and rollback.
- [troubleshooting.md](troubleshooting.md) — empty catalog, config codes, Stripe
  503, gate prerequisites, native SQLite and Fly CLI failures.
- [hosting-decision.md](hosting-decision.md) — one persistent Node process on a
  local volume; the Vercel/libSQL path is dormant.
- [support-runbook.md](support-runbook.md) — support queue and manual deletion.
- [policies/README.md](policies/README.md) — policy versions `v1.1` (current) and
  `v1` (superseded, still readable).
- [echo-protocol.md](echo-protocol.md) — short orientation to the governing
  single-agent protocol.
- [../SECURITY.md](../SECURITY.md) — threat model and secret handling.

## Historical records

These are kept for the decision trail. Do not follow them as current procedure
without checking the selected topology and open gates.

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
