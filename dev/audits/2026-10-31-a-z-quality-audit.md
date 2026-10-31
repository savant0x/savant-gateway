# A–Z quality audit — 2026-10-31

Scope: the working tree on `195ea51` plus FID-2026-1031-077, -078 and -079.
This is a local engineering audit. It does **not** approve a launch, a traffic
cap, a live payment lane, or a hosted-provider contract.

## Verdict

**Local quality: PASS.** The repository builds, typechecks, lints, passes all
394 unit tests, 750 main HTTP checks, the trial HTTP suite, the 123-check load
acceptance measurement, and the 34-check backup/restore drill. The A–Z review
found two concrete read-path defects and two missing product foundations; all
four are addressed or deliberately rejected with measurement.

**Launch: still OPEN.** The crypto/USDC lane, a real-provider load measurement,
operator approval of the load envelope, the container build on Linux, and hosted
deployment remain external dependencies. They are listed at the end, not hidden
inside a green build.

## Evidence run

| Gate | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, zero warnings |
| `npm run quality` | PASS, 400-line ceiling, 355 files |
| `npm test` | 394 pass, 0 fail |
| `npm run build` | exit 0, production route map complete |
| `npm run test:http` | 750 checks + trial suite, pass |
| `npm run test:load` | 123 checks, pass; candidate envelope only |
| `npm run test:recovery` | 34 checks, pass |
| `npm run config:check` | PASS (non-production) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `rg "TODO|FIXME|XXX|HACK"` | no source markers; one placeholder example in a promo input |

## Dimensions

| # | Dimension | Status | Finding and disposition |
| --- | --- | --- | --- |
| A | Architecture and boundaries | PASS | `app/`, `components/`, `lib/providers/`, `lib/store/` keep route, UI, provider and persistence concerns separate. The new promo ledger is a pure `lib/promo-ledger.ts` module with a thin `server-only` store wrapper, so it is testable without weakening the server boundary. |
| B | Billing and ledger integrity | PASS | All money is integer micro-dollars. `computeTokenCostMicros` uses exact integer arithmetic. Promo credit reuses `credit_balance_micros` and `credit_ledger`; there is no second balance. Unit and HTTP tests reconcile the ledger. |
| C | Catalog, models and providers | PASS | Provider-scoped sync, family/group separation, unsupported-endpoint exclusion and quota parsing have dedicated tests. HTTP suite exercises sync, delisting, pagination, benchmark matching and provider disable. |
| D | Customer identity and sessions | PASS | scrypt hashing, opaque 32-byte sessions, HttpOnly/SameSite cookies, session revocation, login throttling, password reset and email verification are covered by tests and HTTP checks. |
| E | Data model and migrations | PASS | Bootstrap is additive and gate-locked; `ensureColumn` tolerates a concurrent add. Fresh build and a restored copy both start. The recovery drill restores 35 tables and survives a second startup. |
| F | Dependencies and supply chain | PASS | Exact top-level versions, lockfile committed, `npm audit --omit=dev` reports 0 vulnerabilities. The load and test dependencies are local fixtures, not live accounts. |
| G | Documentation and operator truth | PASS (local) | `docs/README.md` indexes setup, operator, deployment, troubleshooting and operations. The new `PROMO_CODES_ENABLED` flag and promo behaviour are documented in `.env.example` and the admin UI. Live-provider and hosted limits remain called out as open. |
| H | Error handling and redaction | PASS | `sanitizeError` logs detail and returns a generic client message; configured secrets and token-shaped strings are redacted before storage. HTTP tests assert provider credentials never reach response or durable error rows. |
| I | Financial reconciliation | PASS | `reconcileDatabase` checks balance = baseline + ledger; unit tests cover refunds, conflicts, overdraft and paid top-ups. Recovery drill restores a balanced ledger. Load run reports 0 micro ledger difference and 0 held difference. |
| J | Gateway streaming and settlement | PASS | Paid JSON, SSE, split UTF-8, cancellation, truncation, provider faults and settlement rollback are covered. Every dispatched load call produced exactly one committed settlement and one usage row. |
| K | HTTP contracts and body limits | PASS | JSON roots, 2 MB completion body, 32 MB stream cap, depth/node bounds and dishonest `Content-Length` are tested. HTTP suite covers null/array/string/number/boolean roots on all mutating routes. |
| L | Idempotency and replay | PASS | Stripe webhooks, NOWPayments IPNs and promo redemptions are replay-safe. Promo redemption has a unique `(promo_code_id, user_id)` constraint plus a unique ledger reference. HTTP tests replay webhooks and repeat a promo redemption. |
| M | Key lifecycle and issuance | PASS | 10 active keys and 20 creations/hour per account; revocation is immediate. HTTP suite races concurrent creation and proves the ceiling is persisted. |
| N | Legal, privacy and support | PASS (local) | Every published policy renders, carries its version, has no unreplaced placeholder and is reachable by permanent route. Support requests are account-bound and operator-visible. Legal review by counsel remains an operator dependency, not a code claim. |
| O | Observability and incidents | PASS | Operations snapshot, threshold rules, incident deduplication, alert signing/backoff and recovery notices are tested. The load drill proves an alert delivery failure is recorded and exits non-zero rather than looking healthy. |
| P | Performance and query plans | PASS (measured) | Analytics range predicates were changed from `datetime(created_at)` to direct ISO comparisons; `EXPLAIN QUERY PLAN` now shows `usage_events_created_idx`. A provider composite index was measured and rejected because it adds a write to every settlement while the existing `created_at` index already bounds the day window. The low-write `billing_events(status, claimed_at)` index is kept. Load: 213.71–224.31 admitted rps across three post-change runs (one cold run at 181.42); FID-060 baseline was 229.84. The range is host variance, not a claimed capacity. |
| Q | Quality gates | PASS | Lint zero warnings, typecheck zero errors, 400-line ceiling PASS over 355 files, production build PASS. No test or lint suppression was added. |
| R | Rate limits and admission | PASS | Token-bucket tests cover saturation, refill, clock rollback and retry-after. Gateway tests cover provider concurrency, RPM, account ceilings, paid-key isolation, free sharing and stale observations. HTTP suite proves 429 shapes and post-idle recovery. |
| S | Resilience and recovery | PASS | Backup during writes, checksum verification, restore refusal, integrity check, reconciled ledger, second startup and crash/quarantine paths pass. ENOSPC was not reproduced; the injected storage-write failure exercises the same rollback/quarantine path. |
| T | Security and secrets | PASS | `.env.example` names variables without values; secrets are read from the environment. Origin checks, SameSite/HttpOnly cookies, admin session epoch, provider credential isolation and redaction tests pass. `npm audit` is clean. |
| U | Test coverage | PASS | 394 unit tests, 750 main HTTP checks, a separate trial HTTP suite, 123 load checks and 34 recovery checks. The new promo and activity paths have both pure unit tests and real-route HTTP tests. |
| V | Tracking and lifecycle audit | PASS (new) | `activity_events` is append-only, metadata is allowlisted and size-bounded, secret-shaped keys are rejected, and auth/signup/key/credit/top-up/promo actions write rows. The admin API and overview show the latest events. Login/logout writes are best-effort; money/account writes are transactional. |
| W | UX, accessibility and responsive structure | PASS (structural) | Public pages declare language, have one top-level heading and a skip link. Metadata/OG cards render. The promo card and admin panel use labelled controls and visible error/status roles. A manual screen-reader and device matrix was not run in this pass and is not claimed. |
| X | Configuration and environment | PASS (non-production) | `production-config` tests cover origin, durable database, admin credentials, single process and signal handler. `config:check` passes outside production. Production launch still needs the real secret inventory, which is external. |
| Y | Revenue, margin and economics | PASS | Credit revenue and plan revenue stay separate; MRR, margins, free-pool share and offer economics have pure tests. The load run reconciles 297 credit and 13 free usage rows with no negative fixture credit. |
| Z | Honesty and placeholders | PASS | No TODO/FIXME/stub markers in `app/`, `components/`, `lib/`, `config/` or `scripts/`. The only `XXXX` match is the promo input's format example. Documentation labels local measurements as candidate, not approved capacity. |

## Findings and dispositions

### Fixed

1. **Analytics index defeat.** `datetime(created_at)` wrapped an indexed column
   in four range predicates and one invoice predicate. Changed to direct ISO
   comparison. Query-plan test added.
2. **Payment claim scan.** `billing_events(status, claimed_at)` was missing.
   Added additively; plan test asserts the index.
3. **No free-credit/promo path.** Added hashed, capped, optionally expiring promo
   codes that credit the existing ledger once, default-off. Admin issue/list/
   pause and customer redeem routes are covered by unit and HTTP tests.
4. **No unified lifecycle record.** Added `activity_events`, an allowlisted
   metadata writer, admin read API and overview panel. Instrumented signup,
   login, logout, key create/revoke, credit grant/adjustment, top-up create/paid,
   and promo create/redeem.

### Deliberately rejected

- **Provider composite usage index.** It adds one index write to every
  settlement. The read it would accelerate is already bounded by
  `usage_events_created_idx` on `created_at`, with `provider_slug` filtered
  afterward. Measured throughput with the index was 181.42 / 222.15 / 213.71
  rps; without it was 224.31 rps in the controlled rerun. The index was removed.
- **Expiring wallet dollars.** Promo codes can expire; credited dollars do not.
  Expiring purchased or granted balance would need a separate ledger policy and
  is not part of this scaffold.
- **Retrieving a promo code after creation.** Only a SHA-256 hash is stored.
  Reissue rather than weakening that property.

## Open launch dependencies (not local defects)

| Item | Why it is open |
| --- | --- |
| USDC receive lane | The operator has not purchased the asset or supplied the chain/token, xpub, RPC and screening rulings. FID-068 steps U2/U3 remain blocked. |
| Live provider load | The load fixture is local. Real upstream RPM, latency, budget and hosted volume behaviour are unmeasured. FID-060-LIVE remains open. |
| Operator load approval | `config/load-envelope.json` has no dated approval. `test:load:accept` must keep refusing. |
| Container build | Docker's Linux engine cannot start on this development machine. The first `fly deploy` will be the image's first build. |
| Legal review | The published policies are complete and tested for placeholders, but counsel review is an operator decision. |
| Manual accessibility matrix | Structural checks pass; a real screen-reader/device pass was not run. |

## Reproduction

```bash
npm run typecheck
npm run lint
npm run quality
npm test
npm run build
npm run test:http
npm run test:load
npm run test:recovery
npm run config:check
npm audit --omit=dev
```
