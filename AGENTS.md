# Savant Gateway

A Next.js gateway for one or more upstream providers' full model catalogs:
provider-scoped sync, customer accounts with scoped keys, prepaid credit,
Stripe-confirmed top-ups, subscription plans with metered entitlements,
OpenAI-compatible chat completions with streaming, operator sell prices, credit
settlement, and revenue/cost analytics.

## Governance Boot Gate

This is a **single-agent repository**. The governing contract is
[`dev/echo-v0.1.2-single-agent.md`](dev/echo-v0.1.2-single-agent.md), reached
through the marker at [`ECHO-single-agent.md`](ECHO-single-agent.md). Read that
file 0-EOF before any work session.

[`ECHO.md`](ECHO.md) is the canonical **harness** protocol (10-agent roster,
Hybrid Mode). It is reference material here. Its Hybrid Mode latitude ("the
Orchestrator writes code directly") does **not** apply to this repository and
must not be used as authority to skip the FID path.

The machine-readable contract lives in
[`protocol.config.yaml`](protocol.config.yaml) under `single_agent.protocol`.
No non-trivial code change is written without a FID that has converged through
the Perfection Loop. The operator is the approval boundary.

## Stack

- **Next.js 16** App Router + route handlers (Turbopack)
- **HeroUI v3** with Tailwind CSS 4
- **Font Awesome Free** for icons
- **SQLite** via `better-sqlite3` (local development storage)
- **TypeScript** strict, Node `>=22.18.0`
- **npm** for installs and gates

## Domain Vocabulary

- **Provider:** an upstream account in the registry (slug, wire protocol,
  base URL, credential variable name). The public owner stays Savant Gateway:
  `/v1/models` must publish `owned_by: "savant-gateway"`.
- **Family:** the model line (GPT, Claude, DeepSeek, …), serialized as
  `family`. The legacy `models.provider` column stores this family label.
- **Group:** a first-class billing tier with a stable slug, editable label,
  ordered membership, and a billing mode of `free`, `paid`, or `subscription`.
  UI data calls the mode `access`; `/v1/models` keeps `group` for compatibility
  and adds `group_slug`, `group_label`, and `group_billing_mode`. A manual
  group assignment survives sync; the provider flags only choose the default.
- **Plan:** an operator-authored, purchasable subscription product. It owns the
  price, month/year interval, included weighted-token allowance, overage mode
  and markup, included groups, and optional individual models. A plan is not a
  group and a group is not an entitlement.
- **Subscription:** a purchased snapshot of a plan plus the exact model ids
  that customer may use. Editing a plan changes future checkouts only; refresh
  is an explicit admin action. A customer has at most one active or past-due
  subscription.
- **Billing source:** every gateway call is exactly one of `free`,
  `subscription`, or `credit`. Included plan usage does not debit credit; the
  allowance period and the subscription hold are its admission control.

Never store or emit the upstream `"Free"` sentinel as a family.

## Non-Negotiables

1. **No coding-agent credit.** No agent may be named in a commit message,
   `Co-Authored-By:` trailer, generated-with line, file header, changelog,
   session summary, or FID. The rule is enforced by
   `scripts/attribution-guard.mjs` in the commit hook, pre-push hook, and CI.
   There is no authorized exception.
2. **No secrets in the tree.** `PROVIDER_KEY`, `COMMANDCODE_API_KEY`,
   `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `STRIPE_SECRET_KEY`, and
   `STRIPE_WEBHOOK_SECRET` belong in `.env.local` only. The provider registry
   stores only the environment-variable name. Never print, log, commit, or
   expose a value to the browser.
3. **Read before edit.** Read every touched file 0-EOF; no skimming. Never edit
   a project file through a scripted transform.
4. **Verify before claim.** Run the declared gates and paste real output. A
   green build does not prove a feature works.
5. **No placeholders.** No TODOs, stubs, or dead paths presented as working
   features. Document non-goals honestly instead.
6. **Honest UI and docs.** Every label must describe behavior the code performs.

## Commands

```bash
npm install          # also wires .githooks and the commit template
npm run dev          # http://localhost:3000
npm run lint         # eslint ., zero warnings expected
npm run typecheck    # tsc --noEmit
npm test             # node --test tests/
npm run quality      # 400-line file ceiling
npm run build        # next build
npm run test:recovery # backup/restore drill against disposable databases
npm run verify       # check + test + quality + build + HTTP + recovery
```

The pre-push hook runs the attribution guard, lint, typecheck, tests, quality,
build, both HTTP suites and the recovery drill. It fails closed.

## Quality Bar

Declared in [protocol.config.yaml](protocol.config.yaml) and enforced where
noted:

- `max_file_lines: 400` — **enforced** by `scripts/quality-report.mjs` over
  `app/`, `components/`, `config/`, and `lib/`.
- Function length 50, line length 100, complexity 10, params 4, comment density
  0.33, nesting 3 — review criteria.
- Zero lint errors and zero lint warnings.
- No duplicated lookup or formatting helpers; use `lib/store/*`,
  `components/dashboard/*`, and `components/admin/*`.

## Layout

```text
app/                    landing (/), public catalog (/models), customer auth,
                        account (/account), console, admin
app/admin/(panel)/      authenticated overview, customers, catalog, groups,
                        providers, pricing, analytics
app/api/auth/           signup, login, logout, me
app/api/account/        scoped keys and Stripe checkout
app/api/webhooks/       signature-verified Stripe fulfillment
app/api/admin/          session, catalog, provider registry, pricing, credit
components/landing/     public landing sections
components/catalog/     public full-catalog table
components/account/     auth forms, customer header, keys, top-up, history
components/dashboard/   console sections and shared UI primitives
components/admin/       admin shell, tables, pricing editor, analytics
lib/providers/          registry, provider-scoped sync, OpenAI/Anthropic adapters
lib/provider.ts         compatibility re-export over lib/providers/
lib/model-groups.ts     pure model-group validation, defaults, and price rules
lib/schema/             provider and group schema plus migration helpers
lib/pricing.ts          micro-dollar, markup, margin, hold, and estimate math
lib/gateway.ts          key auth, full-catalog routing, reservation
lib/gateway-stream.ts   streaming relay and settlement on close
lib/gateway-settle.ts   usage parsing, cost/charge, settlement
lib/customer.ts         customer validation
lib/password.ts         scrypt hashing and constant-time verification
lib/customer-session.ts opaque session tokens and cookie options
lib/customer-auth.ts    customer guards and cookie handling
lib/stripe.ts           Stripe configuration and checkout client
lib/topup-amount.ts     exact top-up amount parsing
lib/admin-session.ts    session token signing and password verification
lib/admin-auth.ts       server-side admin guards and cookie handling
lib/store/              split persistence modules
lib/db.ts               SQLite bootstrap and additive migrations
assets/                 source logos and favicons; public copies live in public/
tests/                  Node test-runner suites
scripts/                quality and attribution gates
dev/fids/               active FIDs; archive/ for closed records
templates/              FID and session-summary templates
coding-standards/       language standards referenced by the protocol
```

## FID Workflow

New FIDs use `dev/fids/FID-YYYY-MMDD-NNN-{title}.md` and follow
[templates/FID-TEMPLATE.md](templates/FID-TEMPLATE.md). Non-trivial work moves
through RED → GREEN → AUDIT → ADVERSARIAL → COMPLETE on the FID before code,
then closes only with a real commit, verification receipt, CHANGELOG entry, and
move to `dev/fids/archive/`.

Small, reversible documentation or copy fixes may be made directly; they still
must pass the gates and must not claim unverified behavior.

## Version Control

- Conventional commits: `<type>(<scope>): <imperative description> (<FID-ID>)`.
- Commit verified progress in logical slices.
- Do not force-push `main`.
- Do not commit generated state: `.next/`, `data/*.db*`, `.env*.local`,
  `tsconfig.tsbuildinfo`.
- Source brand assets in `assets/` are committed; their runtime copies live in
  `public/`.

## Docs

- [dev/echo-v0.1.2-single-agent.md](dev/echo-v0.1.2-single-agent.md) — governing single-agent protocol
- [ECHO-single-agent.md](ECHO-single-agent.md) — boot marker
- [ECHO.md](ECHO.md) — canonical harness protocol (reference)
- [protocol.config.yaml](protocol.config.yaml) — gates and quality policy
- [docs/echo-protocol.md](docs/echo-protocol.md) — orientation
- [SCOPE.md](SCOPE.md) — approved scope and operator rulings
- [CHANGELOG.md](CHANGELOG.md) — release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup and contribution rules
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [knowledge.md](knowledge.md) — project facts and gotchas
