# FID: Real monitoring, delivered alerts and incident controls

**Filename:** `FID-2026-1030-059-observability-and-incident-response.md`
**ID:** FID-2026-1030-059
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** converged
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-048, FID-2026-1030-049, FID-2026-1030-051, FID-2026-1030-052, FID-2026-1030-053, FID-2026-1030-057, FID-2026-1030-058
**YAGNI-Compliance:** Verified — instrument real events and one selected alert transport.

## Summary

Make quota/funding, provider errors, settlement failures, payment delivery,
database/backup health and saturation observable, with tested alert delivery and
operational admission controls. A console message is not an alerting service.

## Environment

Existing analytics/provider status, `lib/gateway-stream.ts` fixed settlement
diagnostic and deployment/recovery services planned in 057/058.

## Detailed Description

### Problem / expected behavior / root cause

Financial diagnostics and analytics exist, but no recorded monitoring transport,
on-call destination or delivery drill proves intervention will happen. Empty
traffic must not imply uptime or healthy quota; stale evidence needs explicit age.

### Evidence

The stream repair logs `[gateway.settlement]` with reservation IDs; its audit
explicitly says alert delivery and durable recovery are not implemented by that
fix. `docs/launch-plan.md` phase 3 lists monitoring/delivery/incident requirements.

## Impact Assessment

Gateway/payment/provider/data metrics, secure operator status/actions and incident
runbooks. Risk high: silent lost funds or an uncontrolled bill. Operator selects
alert destination, spend thresholds and ownership; do not send test messages unasked.

## Proposed Solution

### Approach and steps

1. Define bounded, redacted metrics and correlation IDs for dispatch, holds,
   settlements, webhook lag, quota age, errors, reserves, disk and backup age.
2. Implement actual scheduled observation/alert delivery with retry/deduplication,
   resolution and delivery-failure status; distinguish unknown/stale/no-traffic.
3. Add authenticated pause/drain/provider-disable controls that stop new work
   while allowing already incurred accounting and payment fulfillment to settle.
4. Exercise low reserve, stuck recovery, database/backup failure, alert transport
   failure and incident acknowledgment; record received alerts and response actions.

### Verification

Planned `tests/operations-alerts.test.mjs`; extend `tests/analytics.test.mjs` for
unknown/empty observations. Fault/HTTP checks prove protected controls and real
event → monitor → transport invocation. A controlled destination delivery requires
explicit operator authorization and is recorded separately from mock transport tests.

## Verification Gates

- gate: test tests/analytics.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/operations-alerts.test.mjs` and existing analytics tests. Mandatory
external receipt: authorized alert received, delivery failure visible, recovery/
pause/drain response exercised. 060/062 require these controls before traffic.

## Perfection Loop

RED: no demonstrated delivered alerts. GREEN: actual transport, bounded event
ownership and safe incident controls. AUDIT: pending. ADVERSARIAL: alert delivery
can fail during the incident; monitor the monitor without a retry storm.
Five questions: every silent failure state, bounded cardinality/retries, protected
controls, maintainable ownership and auditable delivery rather than green labels.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: pause only new inference admission;
authorized payment fulfillment, durable recovery and drain remain available.
Exercise those paths during an incident so pausing does not create lost money.
Final convergence checks are in the master planning-audit receipt.

Design only. No notification is sent in this planning session; transport setup
and delivery exercise remain named operator-input/acceptance boundaries.

## Lessons Learned

An alert is complete when someone can receive it and act, not when code formats text.
