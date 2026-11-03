# Sandbox launch-readiness receipt

**Date:** 2026-11-03
**FID:** FID-2026-1103-156
**Pinned implementation commit:** `7e24f0e152b6dbe273dec83332a1dff3d19a46d2`
**Status:** technical sandbox readiness verified — **not** launch authorization

This receipt combines FIDs 152–155. It records what was observed, keeps
synthetic measurements separate from realized money, and leaves every launch
decision with the operator. No real payment, funding, live price change,
production database reset, or production acceptance occurred.

## Evidence

| Area | Observation | Receipt |
| --- | --- | --- |
| GitHub | `main` at `7e24f0e` after the pre-push gate | `deployment.md` |
| Vercel | production deployment `READY` at `7e24f0e`, branch `main` | `deployment.md` |
| Runtime diagnostics | Production, Vercel production, storage read `ok` | `hosted-diagnostics.txt` |
| Provider test | Savant `200`, 44 models | `hosted-provider.txt` |
| Provider sync | 44 imported: 11 free, 23 paid, 10 subscription-only, zero warnings | `hosted-provider.txt` |
| Pricing report | 44 rows: 11 free, 10 subscription, 23 safe, 0 review-required, 0 blocked | `pricing-report.json`, `pricing-report.md` |
| Chart reconciliation | exact: $114,400 charged and $35,200 cost across 2 synthetic settlements | `charts.json`, `charts.html` |
| PostgreSQL proof | two connections cannot double-debit; 1/1 passed, 0 skipped | `test-postgres.log` |
| Full verification | all ten gates PASS; 969/969 unit tests, 0 skipped; 263.7s | `verify-summary.json`, `verify.log` |
| Cleanup | disposable database dropped; production was not reset | `postgres-run.json`, `charts-run.log` |

## Verified behavior

- The hosted production deployment and GitHub commit agree at `7e24f0e`.
- Admin Diagnostics reports `PROVIDER_KEY` configured for Savant,
  `COMMANDCODE_API_KEY` missing for the enabled CommandCode provider, and Apixo
  disabled. Only presence is recorded.
- Savant Test and Sync ran on the deployed runtime and imported the complete
  44-model catalog with no warnings. Balance was `$0`; the upstream free plan had
  19,458,089 of 20,000,000 tokens remaining at observation.
- The read-only pricing report classified every hosted catalog row and wrote no
  price, decision, provider, or catalog row. Modeled paid scenario profit was
  $3.33 at current prices and $5.71 at the 30% target recommendation; that is a
  model, not realized revenue.
- The chart receipt recorded two approvals through `setModelPricing` and two
  settlements through `settleCall`. Analytics totals, the 30-day series and the
  usage rows agreed exactly. The unused paid model stayed absent rather than
  becoming a zero-profit row.
- `npm run test:postgres` passed the mandatory two-connection proof. Full
  `npm run verify` passed `check`, `storage:check`, `config:check`, `test`
  (969/969), `test:postgres` (1/1), `quality`, `build`, `test:http`,
  `test:recovery` and `deployment:receipt`.
- The disposable verification database `gateway_verify_1793749080666` and the
  chart database `gateway_chart_1793749036008` were dropped around their runs.
  The production `postgres` database was never reset.

## Limitations and open blockers

1. **CommandCode is enabled in Production without `COMMANDCODE_API_KEY`.** It
   publishes zero models and cannot serve. The operator must add the key to
   Production and Preview and redeploy, or disable the provider. This receipt did
   not change production configuration.
2. **No real-money activity occurred.** All usage and price decisions in the
   chart receipt are synthetic sandbox observations. No checkout, webhook,
   wallet funding, paid upstream inference, subscription sale, or customer
   traffic was exercised.
3. **The hosted provider balance is `$0`.** The Savant free-plan allowance is
   not a funded balance. A future paid launch needs the operator's funding and
   spend controls.
4. **The chart HTML is a receipt view, not a browser run of the React admin
   pages.** The production chart components are compiled by `next build` and
   their data builders are unit-tested; no browser screenshot or interactive
   click-through was performed.
5. **The local deployment receipt reports `clean: false` and local key flags
   `false`.** The tree was being written during receipt capture and the preserved
   client chat export remains untracked. The plain shell does not load
   `.env.local`, so its key flags are not hosted evidence. The hosted Diagnostics
   page is authoritative.
6. **Lint has six pre-existing warnings in `lib/launch-receipt.ts`.** There are
   zero lint errors, and the new pricing files added no warnings. `quality`
   passes the 400-line ceiling.

## Operator-owned next steps

Technical readiness does not authorize launch. The operator boundary remains
FIDs 043, 062, 068 and 127.

1. Resolve the CommandCode key: set it for Production and Preview and redeploy,
   or disable the provider in Admin → Providers.
2. Run the real launch observations in `docs/launch-receipt.md` and
   `dev/acceptance/launch-receipt.json`; silence or an automated test is not
   approval.
3. Re-run the gate with a disposable endpoint:

   ```bash
   npm run test:postgres
   npm run verify
   ```

   Or create and drop a disposable database around the run and export
   `TEST_DATABASE_URL`; never point these gates at the production database.
4. Decide whether to fund the upstream wallet or keep the sandbox boundary.
   Funded inference is a separate, operator-owned action.

## Redaction

This receipt and its linked files name environment-variable keys by name only.
They contain no key value, session cookie, connection string, Stripe secret,
webhook secret, or payment credential. The database receipts contain only a
host, database name, and redacted connection URL where a URL is shown.
