# Savant Gateway — D1–D50 Audit Report

**Source:** `SCOPE.md`, “Discoveries (added as found),”
[SCOPE.md:200](SCOPE.md#L200)–[SCOPE.md:261](SCOPE.md#L261)
**Original audit:** 2026-10-28, read-only review of the legacy Vite/Fastify tree
**Compiled:** 2026-10-29
**Current tree:** `48c21e1`, plus the uncommitted FID-2026-1029-009
implementation and governance records for FID-2026-1029-007, -008, and -010
**Report status:** 0 open, 1 accepted, 49 closed (24 fixed, 25 superseded)

This report compiles the fifty findings recorded in `SCOPE.md` and assigns a
current disposition against the Next.js rebuild. It is a status reconciliation,
not a new penetration test or a runtime exploit exercise. “Closed — superseded”
means the legacy subsystem and its file path no longer exist; it does not imply
that every analogous risk has been independently re-tested.

## Executive Summary

- **50 findings:** 5 high, 2 medium-high, 17 medium, 4 low-medium, 18 low,
  1 informational, 2 process, and 1 operational.
- **49 closed:** 24 fixed (22 in the rebuild, plus D6 and D50 in
  FID-2026-1029-009), 25 superseded because the legacy Vite/Fastify subsystem
  was removed.
- **0 open in the current tree.**
- **1 accepted:** **D23 — rate limiters are per-process.** The current SQLite
  deployment runs one app process; this must change before multi-instance
  deployment.
- The highest-risk legacy findings — plaintext keys/sessions, stub subsystems,
  analytics misclassification, hold leaks, and the free-pool weight gap — are
  fixed in the rebuild, fixed by FID-009, or removed with their subsystems.
- FID-2026-1029-009 is implemented and unit-tested; its full gate receipt and
  commit are still pending. The closure status here records the code change,
  not a completed release.

## Severity and Status Legend

**Severity**

- `High` — revenue, security, or core accounting integrity.
- `Medium–High` — significant operational or product risk.
- `Medium` — material but bounded risk.
- `Low–Medium` — limited impact or conditional exposure.
- `Low` — hygiene, documentation, or narrow edge case.
- `Informational` — observation, not a defect.
- `Process` — repository or workflow issue.
- `Operational` — deployment/architecture limitation.

`SCOPE.md` did not state a severity for D1 or D3. They are marked
`Medium (inferred)` for triage. D47 is recorded as `Low / Process` and counted
as process in the totals.

**Status**

- `Closed — fixed` — the current implementation directly addresses the finding.
- `Closed — superseded` — the legacy subsystem was removed; no current
  equivalent exists.
- `Open` — an equivalent risk is present in the current tree.
- `Accepted` — a deliberate current limitation, documented for revisit.

## Finding Index

| ID | Severity | Finding | Status | Evidence | Remediation |
|---|---|---|---|---|---|
| D1 | Medium (inferred) | Lint gate is not clean (Law 15). | Closed — fixed | SCOPE:204; `npm run lint` exits 0 today | R1 |
| D2 | Medium | Upstream provider secrets stored plaintext at rest. | Closed — superseded | SCOPE:205; legacy `server/` absent; provider key is env-only | R0 |
| D3 | Medium (inferred) | `.env.local` is not loaded by the API server. | Closed — fixed | SCOPE:206; Next loads `.env.local` | R1 |
| D4 | Low–Medium | Test suite passes but logs `SQLITE_ERROR` noise. | Closed — fixed | SCOPE:207; current 48/48 tests pass cleanly | R1 |
| D5 | Low | Swallowed errors in `server/db.ts` (Law 14). | Closed — superseded | SCOPE:208; legacy file absent | R0 |
| D6 | Low | 5xx responses echo `err.message` to clients. | Closed — fixed | SCOPE:209; FID-009 `sanitizeError`; provider fetch, credit, sync | R2 |
| D7 | Informational | Lenient JSON body parser diverges from strict JSON. | Closed — superseded | SCOPE:210; current routes use `request.json()` only | R0 |
| D8 | Process | No VCS metadata in the working copy. | Closed — fixed | SCOPE:211; repository exists on `main` | R1 |
| D9 | Low | Provider failure classification by substring matching. | Closed — superseded | SCOPE:212; legacy classifier absent | R0 |
| D10 | Medium | Non-expiring customer sessions. | Closed — fixed | SCOPE:213; 7-day session TTL | R1 |
| D11 | Low | Client bundle exceeds the Vite warning threshold. | Closed — fixed | SCOPE:214; Next build baseline is clean | R1 |
| D12 | High | Plaintext customer API key secrets stored and re-exposed. | Closed — fixed | SCOPE:215; only SHA-256 hashes are stored | R1 |
| D13 | Medium | Development admin token gated by a substring check. | Closed — fixed | SCOPE:216; env password/session; production loopback bypass off | R1 |
| D14 | Low | Admin balance adjustment can drive a wallet negative. | Closed — superseded | SCOPE:217; current grants are positive-only; overrun is separate | R0 |
| D15 | Low | Admin API-key status update accepts an arbitrary string. | Closed — superseded | SCOPE:218; current operator key route is revoke-only | R0 |
| D16 | Low | `any`-typed route handlers (Law 6). | Closed — fixed | SCOPE:219; no `any` matches in `app/`, `lib/`, `components/` | R1 |
| D17 | Medium | Dispatch-slot accounting bug inflates concurrency. | Closed — superseded | SCOPE:220; dispatch queue absent | R0 |
| D18 | Medium | Client disconnect refunds the entire stream hold. | Closed — fixed | SCOPE:221; stream cancellation settles partial usage | R1 |
| D19 | Low | Dead code and unfinished alerting in the gateway. | Closed — superseded | SCOPE:222; legacy gateway absent | R0 |
| D20 | Low–Medium | Admin subscription statistics return placeholders. | Closed — superseded | SCOPE:223; current admin has no subscription statistics | R5 |
| D21 | Low | Documentation drift on pack depletion. | Closed — superseded | SCOPE:224; token packs absent | R0 |
| D22 | Low | Two RPM sources of truth. | Closed — superseded | SCOPE:225; RPM catalog absent | R0 |
| D23 | Operational | Rate limits and fairness state are per-process only. | Accepted | SCOPE:226; `lib/customer-rate-limit.ts:3` documents one process | R4 |
| D24 | Low | Any positive admin adjustment counts as a top-up. | Closed — superseded | SCOPE:227; restricted-credit gate absent | R0 |
| D25 | Low–Medium | Terminal gateway errors bypass sanitization. | Closed — fixed | SCOPE:228; `safeUpstreamMessage` handles upstream 5xx | R1 |
| D26 | Low | `upgradeUserRpm` has no caller and no replay guard. | Closed — superseded | SCOPE:229; RPM module absent | R0 |
| D27 | Low | Empty catch and hardcoded prices in the RPM module. | Closed — superseded | SCOPE:230; RPM module absent | R0 |
| D28 | Medium | Five admin pages and three public components are orphaned. | Closed — fixed | SCOPE:232; all five panel pages are in `admin-nav.tsx` | R1 |
| D29 | High | Notification, health, and revenue-reporting subsystems are stubs. | Closed — superseded | SCOPE:233; stub subsystems removed | R0 |
| D30 | High | Analytics classify priced models as free and report zero cost. | Closed — fixed | SCOPE:241; analytics uses `charged_micros` and `cost_micros` | R1 |
| D31 | Medium–High | Public uptime reports operational when there is no data. | Closed — superseded | SCOPE:242; no status page in the current tree | R0 |
| D32 | Medium | Installer emits literal `${SLUG()}` aliases and a stale id. | Closed — superseded | SCOPE:243; installer subsystem absent | R0 |
| D33 | Medium | Luna output-limit guard matches retired model ids. | Closed — superseded | SCOPE:244; id-specific guard removed; global budget remains | R0 |
| D34 | High | Reservation lifecycle leaks holds and lets long streams escape billing. | Closed — fixed | SCOPE:245; settlement charges after hold release | R1 |
| D35 | Medium | Account-level free-model weight is never applied. | Closed — superseded | SCOPE:246; account-level system absent | R0 |
| D36 | Medium | Admin allowance data mislabels unlimited plans and subscriptions. | Closed — superseded | SCOPE:247; current admin has no allowance table | R5 |
| D37 | Medium | Revenue totals omit RPM, wallet, and NFT purchases. | Closed — superseded | SCOPE:248; those revenue sources are absent | R0 |
| D38 | Medium | Production start uses the dev runner and ignores `dist-server`. | Closed — fixed | SCOPE:249; `package.json` uses `next start` | R1 |
| D39 | Medium | Admin password rotation does not revoke existing sessions. | Closed — fixed | SCOPE:250; password-derived key plus session epoch | R1 |
| D40 | Low–Medium | Voucher redemption ignores account suspension. | Closed — superseded | SCOPE:251; voucher subsystem absent | R0 |
| D41 | Medium | Admin statistics worker can hang forever. | Closed — superseded | SCOPE:252; worker subsystem absent | R0 |
| D42 | Medium | Activity logs persist PII and upload it off-host. | Closed — superseded | SCOPE:253; activity-log subsystem absent | R0 |
| D43 | Low | “Median” latency is computed as an average. | Closed — fixed | SCOPE:254; current field is `averageLatencyMs` | R1 |
| D44 | Low | Malformed catalog tags can 500 an admin update. | Closed — superseded | SCOPE:255; catalog tags absent | R0 |
| D45 | Low | Dev admin token gates disagree and code is duplicated. | Closed — fixed | SCOPE:256; env-based admin auth replaced the token path | R1 |
| D46 | Low | Additional `any` type-safety shortcuts. | Closed — fixed | SCOPE:257; no `any` matches in the current app surface | R1 |
| D47 | Low / Process | Workspace hygiene artifacts. | Closed — fixed | SCOPE:258; `.gitignore` covers `data/`, `.env*.local`, `*.tsbuildinfo` | R1 |
| D48 | Low | Config/docs drift. | Closed — fixed | SCOPE:259; `.env.example` documents current variables | R1 |
| D49 | Medium–High | `allowFree` capability ignored; subscription-only models advertised as free. | Closed — fixed | SCOPE:260; FID-005 labels the `free/*` non-callable rows `subscription` | R1 |
| D50 | High | Free-tier metering ignores the provider’s weighted free pool. | Closed — fixed | SCOPE:261; FID-009 admission gate, reservations, provider floor | R3 |

## Fixed in FID-2026-1029-009

### D6 — Client-facing error text can expose internal failure details

**Original severity:** Low. **Current status:** Closed — fixed. **Remediation:**
R2.

The legacy finding was that 5xx responses returned `err.message`. The rebuild
fixed the upstream-HTTP path through `safeUpstreamMessage`; local exception
paths still returned the raw message until FID-2026-1029-009.

Fix: `sanitizeError(scope, error, clientMessage)` in `lib/http.ts` logs the
stack server-side and returns only the fixed client text. It is applied to:

- the provider-fetch `catch` in `lib/gateway.ts` — generic 502;
- the admin credit grant failure — now `500` with a generic message;
- the provider-sync failure — generic 502, while `ProviderConfigError` keeps
  its actionable `400` message.

Validated 4xx input errors keep their specific messages. Tests:
`tests/http.test.mjs` asserts an `Error` and a non-`Error` throw both return the
fallback while the detail is logged, and that the provider-failure helper
returns a 502 with a generic body and no secret-looking detail.

### D50 — Free-model calls have no per-user or provider-remaining admission control

**Original severity:** High. **Current status:** Closed — fixed. **Remediation:**
R3.

The legacy finding described a free-tier allowance that ignored the provider’s
weighted pool. The rebuild recorded weighted tokens after the call but enforced
no free-call limit.

Fix (FID-2026-1029-009):

1. `lib/free-pool.ts` defines the policy: a per-user UTC-daily weighted
   allowance, a provider-remaining floor, weighted estimates, reset metadata,
   and an alert flag.
2. `lib/store/free-pool.ts` reserves weighted tokens before dispatch in the same
   immediate SQLite transaction as the decision, sweeping expired reservations
   first. Effective provider remaining is the last synced
   `subscription.tokens_remaining` minus weighted usage recorded since that sync
   minus live reservations.
3. Blocked calls return `429` with `Retry-After`; the per-user allowance also
   returns `X-RateLimit-Reset`. A provider that reports
   `subscription.allowed === false` blocks free calls.
4. Settlement in `lib/store/usage.ts` releases the reservation and records
   actual weighted usage in the usage transaction.
5. A provider remaining at or below
   `FREE_PROVIDER_ALERT_THRESHOLD` logs a structured operator warning, throttled
   to once per hour.

Limits: `FREE_DAILY_WEIGHTED_TOKENS` (default 500,000),
`FREE_PROVIDER_REMAINING_FLOOR` (default 1,000,000), and
`FREE_PROVIDER_ALERT_THRESHOLD` (default 2,000,000). Tests:
`tests/free-pool.test.mjs` covers config parsing, weighting, allowance
boundaries, reservation counting, the provider floor, provider block, the alert
flag, and reset helpers.

Remaining limitation: the gate uses SQLite and is single-process, consistent
with accepted finding D23. It does not add distributed coordination. The
provider-remaining floor is only active after a sync has reported a remaining
figure; the per-user allowance applies regardless.

## Accepted Finding

### D23 — Per-process rate limiters

**Original severity:** Operational. **Current status:** Accepted (single-process
SQLite deployment). **Remediation:** R4.

The current rate limiters use an in-memory `Map`:

- [lib/customer-rate-limit.ts:3](lib/customer-rate-limit.ts#L3) states that the
  limits are per-process and that SQLite deployments run one app process.
- [lib/admin-rate-limit.ts:19](lib/admin-rate-limit.ts#L19) stores windows in a
  process-local `Map`.

This is acceptable for the current single-instance SQLite deployment. It is not
acceptable if the app is scaled horizontally: each process would grant its own
window, multiplying the effective limit. The same applies to the admin login
limiter. Revisit before any multi-instance or serverless deployment; move the
window state to the database or a shared store, or front the app with a shared
rate limiter.

## Remediation Index

| ID | Action | Findings | Priority |
|---|---|---|---|
| R0 | No action: the legacy subsystem and file path were removed by the rebuild. | D2, D5, D7, D9, D14, D15, D17, D19, D21, D22, D24, D26, D27, D29, D31, D32, D33, D35, D37, D40, D41, D42, D44 | Closed |
| R1 | Retain the verified current control; add a focused regression test when the area changes. | D1, D3, D4, D8, D10, D11, D12, D13, D16, D18, D25, D28, D30, D34, D38, D39, D43, D45, D46, D47, D48, D49 | Closed |
| R2 | Sanitize client-facing 5xx and exception messages; log details server-side. | D6 | Closed — FID-009 |
| R3 | Add free-pool admission control: per-user allowance, provider-remaining floor, reservation, reset response, alert. | D50 | Closed — FID-009 |
| R4 | Keep the single-process limiter documented; move to a shared store before multi-instance deployment. | D23 | Accepted — operational |
| R5 | Implement FID-2026-1029-008 for subscription administration and reporting. | D20, D36 | Feature — medium |

## Current Verification Basis

Checked on 2026-10-29 against the current tree:

- `npm run verify` — exit 0 after FID-009.
- `npm run lint` — exit 0, no warnings.
- `npm test` — 62 tests, 62 pass, 0 fail, 0 skipped.
- `npm run quality` — PASS, 400-line ceiling over 127 files.
- `npm run build` — exit 0, 33 routes.
- `git ls-files server src shared` — empty; the legacy Vite/Fastify paths are
  absent.
- `find app/admin -type f` — five panel pages, all represented in
  `components/admin/admin-nav.tsx`.
- `grep` for `: any`, empty catch blocks, and stub markers in `app/`, `lib/`,
  and `components/` — no `any` matches; catches are non-empty and scoped.
- `.env.example` and `.gitignore` inspected for D47/D48.
- `package.json` inspected for D38 (`next start`).

Build baseline: `npm run verify` was rerun for the FID-009 reconciliation and
built 33 routes. The tree is uncommitted; `48c21e1` remains the last commit.

## Limitations

- This is a mapping of the original D1–D50 findings, not a fresh audit of every
  current route.
- “Closed — fixed” means the current code or gate addresses the recorded defect;
  it does not mean every closed finding was exercised at runtime.
- “Closed — superseded” means the legacy path is gone. It does not prove that no
  analogous risk exists in the rebuilt subsystem.
- D6 and D50 were code-inspected; neither was exploited against a running
  server for this report. FID-009’s unit tests exercise policy and sanitization,
  not a live provider.
- D1 and D3 had no severity in the source record; their `Medium (inferred)`
  label is a triage choice, not an original audit rating.
- D50’s allowance size is an operator policy choice. The shipped defaults
  (500,000 weighted tokens per user per UTC day, 1,000,000 provider floor,
  2,000,000 alert threshold) are configurable through `FREE_*` environment
  variables; they are not derived from a customer plan.

## Source and Related Records

- [SCOPE.md](SCOPE.md) — original fifty findings, law snapshot, rulings, and
  progress log.
- [FID-2026-1029-001](dev/fids/archive/FID-2026-1029-001-nextjs-gateway-rebuild.md)
  — rebuild record and closure reconciliation.
- [dev/fids/audit/v1-baseline.md](dev/fids/audit/v1-baseline.md) — FID-001
  audit baseline; its line 112 states the full D1–D50 list lives in `SCOPE.md`.
- [dev/fids/audit/v5-audit.md](dev/fids/audit/v5-audit.md) — latest printed
  FID-001 audit iteration; not the canonical finding list.
- [FID-2026-1029-007](dev/fids/archive/FID-2026-1029-007-model-group-control.md) —
  closed group-control design.
- [FID-2026-1029-008](dev/fids/archive/FID-2026-1029-008-subscription-plans-and-entitlements.md)
  — closed subscription-service design; relevant to D20 and D36.
- [FID-2026-1029-009](dev/fids/archive/FID-2026-1029-009-error-sanitization-and-free-pool-admission.md)
  — implementation and gate receipt for D6 and D50.
- [FID-2026-1029-010](dev/fids/archive/FID-2026-1029-010-multi-provider-registry.md)
  — converged multi-provider design; no application code changed.
