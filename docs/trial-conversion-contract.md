# Trial conversion contract

Status: disabled implementation, 2026-10-29. FID-015 implements the grant ledger
and routing with configurable amounts; 100,000 is the development default, not
an activated customer entitlement. The pair map is empty and gateway grant
budget zero by default. Final offering selection remains a launch decision.

## Customer behavior

Each eligible customer receives one lifetime weighted-token grant. Keys share
the customer's grant; creating keys, logging in again, or crossing midnight
does not replenish it. Requests reserve their estimated weighted usage before
dispatch and settle the actual usage afterward. Failed requests release unused
reservations. Reported billable usage on errors or cancellation still counts.

When a request cannot fit within the trial remainder, do not split its billing
between trial and credit. Use its explicitly paired paid route only when the
customer has sufficient prepaid credit; otherwise return 402 with trial/credit
guidance. This avoids resetting trials or silently consuming the shared pool.
Show the paid input/output rates before customers opt into funded usage.

Insufficient shared upstream capacity returns a temporary capacity error.
It must not erase the customer's trial grant or silently start charging them.
The upstream daily reset changes capacity only. Subscription entitlement remains
a separate billing source and cannot mint another trial.

## Candidate model pairs

Read-only evidence from the stored active catalog on 2026-10-29: 11 free rows,
six exact paid-id counterparts. Matching names are candidates, not proof of
equivalent upstream behavior. Validate each pair's protocol, capabilities,
context and provider billing before activating it.

| Trial upstream id | Candidate paid upstream id |
| --- | --- |
| `free/deepseek-v4.1-flash` | `deepseek-v4.1-flash` |
| `free/gemini-3.8-flash` | `gemini-3.8-flash` |
| `free/glm-5.3` | `glm-5.3` |
| `free/glm-5.3-flash` | `glm-5.3-flash` |
| `free/gpt-6-luna` | `gpt-6-luna` |
| `free/jev-1.13` | `jev-1.13` |

No exact paid counterpart exists in this snapshot for
`free/deepseek-v4-pro-0813`, `free/glm-5.3-flashx`, `free/kimi-k3`,
`free/minimax-m3.1-flash`, or `free/qwen-3.8-max`. Keep these ineligible for
automatic conversion unless an equivalent paid route is explicitly approved.
In particular, do not assume `deepseek-v4-pro` matches a dated model revision
or that `kimi-k3.1-pro` matches `kimi-k3`.

## Implemented persistence

The ledger snapshots recorded historical daily usage against the first grant;
existing customers do not receive a fresh free allowance on conversion. Each
reservation accepts exactly one settlement and remains after expiry for late
accounting. The existing free reservation links customer/key/model/provider;
the trial reservation shares its id. Usage records preserve requested model,
serving upstream id, billing source and charges. Trial remains billing source
`free`, distinguished by its durable reservation/grant record.

Pair configuration uses the explicit environment map. Account UI shows lifetime
balances and paid rates; `/v1/models` adds `trial_paid_transition`. This is
implemented infrastructure; public catalog presentation, versioned pair admin
controls and full upstream capacity management remain activation requirements.

## Activation requirements

- One immutable grant per customer with a uniqueness constraint, original amount,
  issued time and eligibility evidence. Existing daily usage is not silently
  converted into a fresh grant. The implemented policy subtracts historical usage.
- Reservation rows reference customer, key, public model, serving model, provider,
  grant, estimated weight, expiry and request identity. Use immediate SQLite
  transactions so competing keys cannot both reserve the last tokens.
- An append-only settlement references the unique reservation and actual usage.
  Replay must not consume the grant twice. Retain an accounting record after
  reservation expiry so late settlement remains safe and observable.
- Pair configuration stores both model ids, eligibility, activation state and
  revision. Usage records retain requested public id, actual serving model,
  provider, customer billing source, raw tokens and upstream weighted usage.
- Admission must reserve shared capacity across trial and included subscriptions;
  customer credit does not imply upstream free-pool capacity. A paid upstream
  wallet route uses its own funded admission policy.
- Unknown/stale upstream quota cannot be interpreted as unlimited free capacity.
  Automatic refresh and UTC reset handling require runtime verification.
- Activation remains disabled until account verification, a gateway acquisition
  budget, shared RPM controls and configured model pairs pass acceptance.

## Required acceptance

Use disposable customers and a deterministic mock provider for grant uniqueness,
multiple keys, concurrent admission, exact boundary, exhausted grant, payment
credit, paid routing, unequal input/output pricing, duplicate settlement, JSON,
SSE cancellation, late usage, no paid counterpart, provider depletion, UTC reset,
and subscription overlap. Check requested and serving model identities in storage.

Then run the real upstream and Stripe journey described in
`launch-readiness.md`. Mock fulfillment does not prove a funded wallet or real
Checkout. Funding and Stripe setup retain the operator's near-launch timing.
