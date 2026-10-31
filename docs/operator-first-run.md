# Operator first run

The operator console is the authenticated surface at `/admin/*`. It is separate
from the customer account pages and from the development-only `/dashboard`
console. Every operator page and API sends `Cache-Control: no-store` and
`noindex`.

## Sign in

1. Set `ADMIN_PASSWORD` (12+ characters) and `ADMIN_SESSION_SECRET` (32+
   characters) in `.env.local`.
2. Open `/admin/login`.
3. The session is an HttpOnly cookie signed with `ADMIN_SESSION_SECRET`.
   Rotating that secret invalidates existing operator sessions immediately,
   which is the intended emergency action.

If sign-in is unavailable, both admin values are missing or too short. The
`config:check:prod` codes name the missing inventory without printing values.

## First-run order

Do these once, in order, before inviting a customer:

1. **Providers** — `/admin/providers`. Confirm the base URL, wire protocol,
   credential variable name and capabilities. Run **Test**, then **Sync**. A
   provider row stores a variable name, never the secret value.
2. **Catalog** — `/admin/catalog`. Confirm the synced models and their
   `in_catalog` state. A model that vanished upstream is delisted, not deleted,
   so its prices and history remain.
3. **Groups** — `/admin/groups`. Put each model in exactly one billing tier:
   `free`, `paid` or `subscription`. A manual assignment survives a later sync.
4. **Pricing** — `/admin/pricing`. Set sell prices or a markup for paid rows.
   Free-group rows are always zero-priced. Do not publish a price you have not
   checked against real upstream cost.
5. **Plans** — `/admin/plans`. Plans are authored but not sold while
   `PLAN_SALES_ENABLED` is off. Do not publish a plan for purchase until the
   recurring-payment and offering gates in the launch plan are closed.
6. **Credit** — the **Tenant credit** card on `/admin`. It funds the local
   development tenant's keys, writes an audited `credit_ledger` row, and does
   not create a top-up record or a Stripe payment. Customer balances are funded
   by Stripe webhook fulfilment; `/admin/customers` is the read-only customer and
   payment view.
7. **Reconciliation** — `/admin/reconciliation`. Require `totals.balanced`, then
   review unresolved settlements and quarantined holds. A failed stream can
   leave a hold without a debit; it is a work item, not a refund instruction.
8. **Support** — `/admin/support`. Read open requests, act, and resolve with a
   note. The note is customer-visible. There is no email delivery; the customer
   sees the note the next time `/account` renders.
9. **Analytics** — `/admin/analytics`. Check revenue, upstream cost, margin and
   token volume over 7/30/90 days. Upstream cost and customer revenue are
   separate columns; do not infer one from the other.

## Daily checks

- `/api/health` answers liveness only.
- `/api/ready` answers readiness and must return `200 ready` with
  `mode: "durable"` in production. A `503` means configuration or storage is
  unusable; do not route traffic to it.
- `/admin/reconciliation` should remain balanced. Review new unresolved
  settlements before releasing or adjusting anything.
- Backup output must contain both `<name>.db` and `<name>.db.json`. Pull both off
  the volume and verify the SHA-256 against the sidecar.

## Safety rails

- **One process, one volume.** Do not add a second Machine, a process manager,
  `WEB_CONCURRENCY > 1` or autoscaling. The rate limiter and SQLite writer assume
  one process, and the startup gate rejects a multi-worker topology.
- **Deploys replace the Machine** because the volume attaches to one Machine at a
  time. Expect a short gap; the runbook sets a 120-second drain.
- **Backups are not off-site by default.** A copy on the same volume is not a
  recovery plan. Pull it off and keep one copy outside the provider failure
  domain.
- **The first live restore is still outstanding.** The disposable drill proves
  the code path; it is not an RPO/RTO receipt for the production volume. Record
  the operator targets and the timed restore before launch.
- **No plan sales and no trials** until the launch gates close. `TRIAL_ENABLED`
  and `PLAN_SALES_ENABLED` default to off for a reason; changing them is an
  offering decision, not a configuration tweak.

## Related

- [Getting started](getting-started.md)
- [Deployment runbook](deployment-runbook.md)
- [Support runbook](support-runbook.md)
- [Project status](project-status.md)
