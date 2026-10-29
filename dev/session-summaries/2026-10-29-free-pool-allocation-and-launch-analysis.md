# Session: free-pool allocation, context banner, launch analysis — 2026-10-29

Status: implementation and records complete; gates pass. Trial activation, plan
sales, real Stripe delivery, and funded paid inference remain unverified and are
not claimed.

Operator request: fix the stale issues; establish how the trial credit system is
wired; split 90% of the 20M daily upstream allowance across activated accounts
each day; decide whether to keep or remove subscriptions; add a
dashboard-editable string carried in every request's context; optimize caching;
and produce a Gemini Deep Research prompt for an early-stage business plan.

Intent before edits: repair records first; reuse the existing immediate
admission transaction for allocation rather than adding a scheduler; keep the
billing lookup uncached; decide subscriptions from evidence rather than
removing a working path; leave the trial off.

## Implemented

- **FID-2026-1029-016 — daily shared allocation.** New `free_pool_allocations`
  table, pure split math (`lib/allocation.ts`), testable SQL
  (`lib/allocation-ledger.ts`), settings-aware store, admission integration, and
  Admin → Gateway controls. Activated account = active user with at least one
  active key. 90% allocated, 10% reserve, grants durable per UTC day. A joining
  account rebalances existing grants down to the new fair share, floored at each
  account's recorded usage plus holds (FID-2026-1029-019 corrected the first
  pass, which let the first account of the day bank the entire share).
- **FID-2026-1029-017 — context banner.** Settings-backed string and enable
  switch, 2,000-character validation, leading system message on every upstream
  request, token accounting before admission. Works for OpenAI and Anthropic
  upstreams.
- **FID-2026-1029-018 — catalog memo.** Five-second TTL memo on `listModels`
  only, measured at 150.2 µs avoided per query (300 runs, 44 rows). Billing and
  admin reads stay uncached.
- **Records and analysis.** `docs/trial-system-audit.md`,
  `docs/subscriptions-decision.md`, `docs/business-plan-research-prompt.md`;
  `.env.example` scaffold header removed and allocation variables added;
  `dev/agenda.md` rewritten; `docs/launch-readiness.md` updated.

## Decisions

- **Trial: stays off.** The ledger is complete, but no code writes
  `users.email_verified_at`, so a grant can never issue. Enabling it to test
  would hand out real upstream capacity and document unsupported behavior.
- **Subscriptions: keep, do not sell at launch.** Implemented and locally
  verified; real Stripe delivery and a funded paid wallet are missing, and plan
  allowances would spend paid upstream capacity with no shared admission policy.
  Plans stay archived/draft; unconfigured Stripe already returns `503`.
- **Cache: display only, TTL-bounded.** No invalidation hooks across eight
  mutation sites; a five-second expiry fails safe and a price edit cannot
  mis-bill.
- **Banner: billable.** Its tokens count toward the call because the upstream
  bills them; the admin copy says so rather than hiding the cost.

## Verification receipt

```text
npm run verify: exit 0
lint: zero warnings
typecheck: exit 0
tests: 135 passed, 0 failed
quality: PASS (400-line ceiling, 207 files scanned)
production build: exit 0 (54 app routes, including /admin/gateway and
  /api/admin/gateway)
http-suite: 100 checks PASS
trial-http-suite: all checks PASS
```

Implementation committed as `58d5556`; FID-016/017/018 are closed against that
commit and archived. The join-rebalance correction is committed as `2626a13`;
FID-019 is closed against that commit and archived.

Pure allocation, banner, and cache behavior is unit-tested. The allocation
ledger is exercised against an in-memory database. The admin page and PATCH
route are compiled and gated but were not clicked through in a browser in this
pass; no live upstream call was made.

## Sequencing disclosure

The operator directed implementation directly. FIDs 016–018 were authored in the
same pass as the code and record the converged design retroactively; they do not
claim code was written only after convergence. This is a deviation from
FID-Bound Execution and is recorded in `SCOPE.md` (A9) and in each FID.

## Handoff

Branch `main`, base `16e431f`. Commits are local in this session; nothing was
pushed. Untracked local-only `.savant/`, `debug/`, `dev/audit/` were preserved,
and newly appeared `.commandcode/` and `.opencode/` were left untouched.

### Resume here

1. Read the governing protocol, `SCOPE.md`, this summary,
   `docs/launch-readiness.md`, `docs/trial-system-audit.md`, and
   `docs/subscriptions-decision.md`.
2. Keep `TRIAL_ENABLED=false` and sell no plans. Decide the shared
   capacity/RPM model before public traffic: allocation now caps free usage but
   subscriptions, trial, and credit still admit independently.
3. Use `docs/business-plan-research-prompt.md` before choosing paid tiers.
4. Configure Stripe test credentials and fund the upstream wallet near launch,
   then run the acceptance journey. No mock test proves either.
