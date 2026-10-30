# Deeper systems review — 2026-10-30

Scope H3: begin with request/admission/settlement. This is a coverage and evidence
record, not certification of every system. Full launch requirements live in
`docs/launch-plan.md`; the approved session register is `SCOPE.md`.

## Review map

| Order | Boundary | Production entry points | Existing evidence to exercise |
| --- | --- | --- | --- |
| 1 | Request and admission | `/v1/chat/completions`, `lib/gateway.ts`, reservation stores | HTTP suites, allocation/free-pool/rate-limit tests |
| 2 | Money and streaming settlement | `lib/gateway-settle.ts`, `lib/gateway-stream.ts`, `lib/store/usage.ts` | Money/pricing tests, HTTP JSON/SSE ledger checks |
| 3 | Identity and isolation | auth/account/admin routes and guards | Session tests, cross-account/foreign-origin HTTP checks |
| 4 | Payments/subscriptions | Stripe webhook and subscription stores | Signed-event HTTP tests, plans tests, real service acceptance |
| 5 | Provider/catalog lifecycle | provider sync, group/pricing stores, benchmark sync | Provider/group/benchmark tests, migration and outage checks |
| 6 | Deployment and recovery | SQLite bootstrap, runtime, reverse proxy | Backup restore, restart, load, alert and real SSE receipts |

## Evidence discipline

For each investigation record the exact scenario, source path, expected result,
observed output, repair FID and verification receipt. Existing tests cover their
named scenarios only. No production credentials or funds are used by local
fixtures. Live service and deployment acceptance require operator inputs.

## Initial source inspection

- `app/v1/chat/completions/route.ts` calls `handleChatCompletions`.
- `lib/gateway.ts` authenticates before parsing, then resolves the model, applies
  rate limits and reserves subscription/free/credit capacity before dispatch.
- `lib/gateway-settle.ts` chooses a billing source and calls `recordUsage`.
- `lib/store/usage.ts` writes settlement and usage within an immediate transaction.
- `lib/gateway-stream.ts` has an internal once-only finish guard. Its settlement
  catch currently discards write failures; this requires a demonstrated failure
  case and repair, not a claim that the guard proves durable accounting.
- `lib/gateway.ts` casts parsed JSON to a record without checking null. A JSON
  `null` body reaches `body.model`, which requires a route-level reproduction.

The initial observations above are the pre-repair state. Runtime reproduction
and repairs are recorded below under FID-2026-1030-042.

## Runtime findings and repairs

The disposable production HTTP harness demonstrated two defects before repair:
null completion/benchmark roots returned 500; primitive/array benchmark roots
were accepted. A SQLite trigger aborting usage insertion left a 147-micro hold
and no usage/debit, but the paid stream still completed normally.

Repairs: the shared `isJsonObject` guard returns 400 at both route boundaries;
the stream attempts accounting once, emits a safe reservation diagnostic on
write failure and fails the transport. It withholds `[DONE]` until the usage
transaction commits. Ledger/debit/usage rollback and the unresolved hold remain
visible; a later healthy request settles only its own reservation.

Additional implementation audit: immediately forwarding `[DONE]` would let
clients accept success before seeing the later transport error. The terminal
line is now delayed; regression reads retain partial data and assert its absence
on failure. Normal output is exercised with CRLF and a UTF-8 character split
across upstream chunks. Client disconnect records one cancelled usage/debit
and releases only its own hold.

```text
RED: null completion=500 benchmark=500
RED: failed settlement completed=true, hold=147, usageDelta=0
GREEN: every tested root completion=400 benchmark=400
GREEN: failed settlement completed=false, hold=147, usageDelta=0
PASS: exact paid SSE debit; one usage and ledger row; split UTF-8 preserved
PASS: failed transaction rolls back debit/usage/ledger and retains reservation
PASS: later request succeeds; unresolved reservation remains visible
PASS: failed stream never acknowledges DONE; diagnostic excludes raw exception
PASS: client disconnect settles once and releases only its own hold
http-suite: 138 checks PASS
```

The normal HTTP suite already exercises signup/session revocation, key isolation,
signed top-up replay/mismatch and ordinary paid settlement; those checks were
rerun, not treated as a complete adversarial identity/payment audit. The trial
suite remains fixture evidence and does not activate trials.

## Coverage limits and next review boundary

This pass completes the initial investigations, not the entire review map.
Cross-mode provider admission (standing blocker B7), expired/resumed holds,
provider usage-field fidelity, crash/restart reconciliation, payment ordering,
deeper isolation and deployment recovery need their phase-2/3 evidence before
launch. No real Stripe delivery, funded upstream call, trial activation,
alert delivery, restore drill or deployment was attempted.

A failed transaction's retained hold identifies the request; it is not a
durable replay queue. The launch plan requires failed-settlement alerting and
financial reconciliation before public traffic. Do not release or refund an
unresolved reservation merely because a stream failed after output was served.
