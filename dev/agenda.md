# Agenda

1. Keep the lifetime trial disabled (`TRIAL_ENABLED=false`, empty pair map,
   zero grant budget) until signup verification exists. The ledger requires
   `users.email_verified_at`, which no route currently writes, so no grant can
   be issued today. See `docs/trial-system-audit.md`.
2. Operate the daily shared free-pool allocation (90% of the upstream daily
   weighted pool split across activated accounts) and extend it to shared
   upstream RPM control before public traffic.
3. Decide whether subscription plans stay purchasable at launch. Code is
   implemented and verified locally; real Stripe delivery is unverified and
   plan allowances would consume funded upstream capacity. See
   `docs/subscriptions-decision.md`.
4. Configure real Stripe test credentials and fund the upstream wallet near
   launch, then run the acceptance journey in `docs/launch-readiness.md`.
5. Use `docs/business-plan-research-prompt.md` to obtain an independent
   early-stage pricing and profitability plan before enabling paid tiers.
