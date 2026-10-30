# FID: Approved customer policies, privacy and functioning support

**Filename:** `FID-2026-1030-061-policies-privacy-and-support.md`
**ID:** FID-2026-1030-061
**Parent:** FID-2026-1030-043
**Severity:** high
**Status:** implemented — policies v1.1 published (v1 superseded), acceptance recorded
**Created:** 2026-10-30
**Automation level:** 3
**Depends on:** FID-2026-1030-044, FID-2026-1030-047
**YAGNI-Compliance:** Verified — publish approved behavior and an actual owned contact.

## Summary

Publish accurate customer policies and privacy/support information connected to
actual behavior, billing and data flow. The operator approves legal/commercial
positions and support ownership; generated prose is not legal or operational approval.

## Environment

Public page/footer/docs surfaces, customer/auth/payment flows, retention/logging,
upstream providers and context-banner settings.

## Detailed Description

### Problem / expected behavior / root cause

Launch readiness lists terms, privacy, refund/dispute/credit/expiry, acceptable
use and support as unresolved. Current footer has no policy/support links and
source inventory has no corresponding implemented policy/contact surface.
Do not import unverified research claims about tax, licensing or fraud liability.

### Evidence

`components/landing/site-footer.tsx:15-19` lists catalog/plans/docs/account/admin.
`docs/launch-plan.md` phase 1 requires approved policies. `lib/context-banner.ts`
supports an operator-authored billable banner; its behavior must not contradict
privacy or prompt-processing claims. 047 inventories actual retained/logged data.

## Impact Assessment

Public policy/contact pages, checkout/account disclosures, data retention/deletion
workflow and support runbook. Risk high: unsupported commitments or inaccessible
customer remedies. Operator supplies approved jurisdictional advice, decisions and contact.

## Proposed Solution

### Approach and steps

1. Inventory actual personal/payment/request data flow, storage, upstream recipients,
   retention and banner modifications; identify any promised deletion not implemented.
2. Obtain approved terms/privacy/acceptable-use, refund/dispute, credit liability/
   expiry, taxes and support-response policies consistent with 044/052/053.
3. Publish approved versioned pages and working navigation/contact; wire any consent,
   data request or remediation workflow the published commitments require.
4. Exercise a controlled support/privacy/refund inquiry through the real owned
   channel and audit its resolution path, respecting explicit messaging authorization.

### Verification

Existing `tests/http.test.mjs` plus HTTP/browser checks prove public pages,
disclosures, links and protected data-request ownership. Planned
`tests/customer-policy.test.mjs` covers policy-version/consent rules if implemented.
Intended callers: footer/account/checkout → published approved policy/contact;
support/data requests → authenticated audited workflow, never an unmonitored form.

## Verification Gates

- gate: test tests/http.test.mjs

Planning audit under 043. Implementation: `npm run verify`; `npm test` includes
planned `tests/customer-policy.test.mjs` when behavior is added. Required operator
receipt: approved text/policies and working contact ownership; real inquiry delivery
requires authorization. No invented address, guaranteed SLA or blanket legal claim.

## Perfection Loop

RED: missing published policies/working support proof. GREEN: behavior inventory,
operator approval and real resolution path. AUDIT: complete for the implemented
support path; policy text still needs operator approval. ADVERSARIAL: promising
deletion or refunds without a reachable writer creates a false product feature.
Five questions: every customer remedy/data class, bounded retention, hostile
requests, maintainable policy versions and verifiable customer commitments.

## Resolution

Loop 2 AUDIT/ADVERSARIAL → SELF-CORRECT: reconcile deletion commitments with
approved financial/security retention per data class. Prove actual removal or
documented retention; a support acknowledgment alone does not satisfy a request.
Final convergence checks are in the master planning-audit receipt.

Implemented the working, auditable support path and the verifiable retention
facts. Operator-approved commercial/legal decisions remain named inputs; this
FID does not select a jurisdiction, publish legal advice or send messages.

## Implementation Evidence

- `lib/schema/support.ts`, `lib/store/support.ts` — durable `support_requests`
  with kind, status (`open`/`resolved`), operator note and timestamps. Every row
  belongs to an account; only the operator can resolve.
- `app/api/account/support/route.ts` — authenticated, same-origin GET/POST,
  five requests per account per hour, server-side validation. No public form.
- `app/api/admin/support/route.ts` + `/admin/support` — operator queue with the
  customer identity, open count and a resolve action that records the note.
- `components/account/support-card.tsx` — request form and the customer's own
  history, including resolution notes.
- `app/support/page.tsx` + footer link — explains that requests are account-bound
  and states no address, response-time guarantee or third-party system. The HTTP
  suite asserts the page invents no `mailto:` or `support@` address.
- `docs/support-runbook.md` — operator procedure, including the deletion path.
  A customer deletion removes the account and every cascading row; usage events
  are retained with `user_id` nulled, which is a deliberate billing/audit
  retention and must be stated in any privacy text.
- `tests/customer-policy.test.mjs` — kinds, bounds, trimming, NUL stripping and
  note limits. HTTP receipt: anonymous `401`, foreign origin `403`, invalid
  payload `400`, recorded `201`, cross-account isolation, operator visibility,
  resolution and the customer-visible note.

Verification: `npm run verify` exit 0 — 305 unit tests, 376 HTTP checks, trial
HTTP PASS, quality PASS (276 files), clean lint/typecheck/build.

## Policy Publication — v1, effective 2026-10-30

The operator answered the 61-question sheet in `docs/policies/answer-sheet.md`
and signed off (H-2 `CONFIRMED`) on publishing version 1.0. The published text is
`content/legal/v1/{terms,privacy,refunds,acceptable-use}.md`; the pre-publication
drafts are preserved unchanged in `docs/policies/drafts/` as review history.

- `lib/legal-meta.ts` — slug, title, version `v1` / label `1.0`, effective
  `2026-10-30`, operator `Savant AI`, contact, and route helpers. Metadata is
  separated from filesystem access so the dates and slugs are unit tested.
- `lib/legal-markdown.ts` — a parser for exactly the Markdown the documents use
  (headings, paragraphs, bullet and ordered lists, bold, inline code, links).
  Unsupported constructs fall through as paragraph text rather than disappearing
  from a legal page.
- `app/terms`, `/privacy`, `/refunds`, `/acceptable-use` — statically prerendered
  current text; `/legal/v1/<slug>` is the permanent route (SSG,
  `dynamicParams = false`, so an unpublished version is a 404); `/legal` indexes
  the versions.
- `components/landing/site-footer.tsx` — a legal row linking all four pages on
every page that renders the footer.
- `app/signup` + `components/account/auth-form.tsx` + `app/api/auth/signup` —
  signup requires the acceptance checkbox and the API refuses a body without
  `acceptedPolicies: true`; the acceptance row is written in the same request as
  the account, so no account exists without a record.
- `lib/schema/policies.ts`, `lib/store/policies.ts`,
  `app/api/account/policies` — `policy_acceptances(user_id, version)` with a
  unique constraint, source `signup`/`account`, cascade on account deletion, and
  idempotent recording so the first timestamp stands.
- `components/account/policy-acceptance-card.tsx` — existing accounts are asked
  once; the card disappears when the server confirms acceptance.

Verification: `npm run verify` exit 0 — 311 unit tests (6 new in
`tests/policies.test.mjs`: no unreplaced placeholder, decided positions present,
version/date/identity agreement, route stability, parser blocks, inline
segments), 421 HTTP checks (45 new: four pages served, version and date present,
no placeholder, permanent route, unpublished version 404, legal index, footer
links, signup refusal without acceptance, signup acceptance row, account banner
when no row exists, cross-origin 403, signed-out 401, unknown version 400,
account acceptance, idempotency), trial HTTP PASS, quality PASS (290 files).

Receipt on `origin/main`: commit `69e050d`, CI run 41114926726 green and
attribution-guard run 41114926691 green. The CI job log shows quality PASS over
290 files, a successful production build, `http-suite: 421 checks PASS` and
`trial-http-suite: all checks PASS`; lint, typecheck and the unit tests run
before those steps in the same fail-fast job and the job completed. The pre-push
hook ran the same `npm run verify` gate before the push was accepted.

Published positions the operator delegated, chosen by the publisher and listed in
`docs/policies/README.md`: three-month liability cap where exclusion is not
allowed, 30-day log and backup retention with deletion not propagated to
backups, 30-day request deadline, US-only transfer disclosure, no voluntary
refunds beyond duplicate/unauthorized charges and statutory rights, no credit
expiry, and concrete excluded data and high-impact-use limits.

Facts the drafts rely on, each checked in source: passwords use scrypt and
tokens/keys are stored as hashes; the customer cookie lasts seven days and the
admin cookie eight hours, HttpOnly and Secure in production; no analytics or
advertising script is loaded; failed-before-usage calls settle at zero while
served usage is charged even if a stream later errors; credit has no expiry code;
refunds are bounded ledger appends with no Stripe Refund call; account deletion
cascades every account-owned row and retains usage events with `user_id` null.

## Policy v1.1 — corrections, effective 2026-10-30

Two claims in v1 were wrong, and both were corrected the same day rather than
left to age:

- **Tax.** v1 said tax is calculated and collected by Stripe where configured.
  `app/api/account/topup/route.ts` creates the Checkout Session with `mode`,
  `line_items`, `metadata` and the return URLs only — no `automatic_tax`, no
  `tax_id_collection`, no invoice. Checkout therefore adds no tax line. v1.1
  states that no tax is calculated or collected, that no separate invoice or VAT
  document is issued, that the Stripe receipt is the payment record, and that
  any applicable tax is the buyer's responsibility.
- **Registered address.** None exists to print; the operator is not registered
  as a separate legal entity. v1.1 says exactly that, names Kentucky, United
  States, and states that a postal address is available on request and will be
  printed once one exists. No address was invented.

The convenience of printing an address was rejected deliberately: a fake one on
a contract page is worse than an honest "not yet".

`content/legal/v1.1/` is a copy of v1 with those two edits (terms §3 and §8,
privacy §1); refunds and acceptable use are carried forward unchanged. `v1`
stays reachable at `/legal/v1/<slug>` and is marked superseded, so a customer can
see what v1 said. Acceptance is version-keyed, so every account that accepted v1
is asked again; the v1 row is retained as history.

Receipt: `npm run verify` exit 0 — 312 unit tests (7 in
`tests/policies.test.mjs`, including one that asserts v1 still contains the old
tax sentence while v1.1 does not), 423 HTTP checks (the superseded version
reachable and labelled, the current version's permanent route, and an account
holding a v1 acceptance being asked for v1.1 before its earlier row is
preserved), trial HTTP PASS, quality PASS.

## Remaining Gates

Every deferred item is now an executable launch gate in
`docs/launch-plan.md` → Phase 1 → "Pre-launch policy gates", with the evidence
that closes it. The list covers registration and address, host retention facts,
the role contact address, the tax position staying matched to the checkout
payload, the Stripe business profile and a rehearsed refund, a real deletion,
the counsel decision, third-party script and header drift, plan-sale terms and
the authoritative language.

The retention gate is now partially answered for the leading host. Vercel keeps
runtime logs for 1 hour on Hobby, 1 day on Pro and 3 days on Enterprise, with
Observability Plus extending to about 30 days, so the published "up to 30 days"
would only be true with that add-on. Vercel also cannot run the current SQLite
and per-process rate-limit design at all, which makes host selection a
correctness decision rather than a preference; `docs/launch-plan.md` Phase 3
records both paths.

- No counsel reviewed the text. The operator accepted that on 2026-10-30; the
  published documents describe themselves as versioned text, not legal advice.
- Registering the entity and publishing a real address is the next substantive
  improvement; until then the terms say the address is available on request.
- If Stripe Tax is ever enabled in the Stripe account, checkout must send
  `automatic_tax: { enabled: true }` and the tax text must change in a new
  version. Neither exists today, and doing only one of them would make the
documents false.
- No outbound email or messaging transport: a request is a durable queue entry,
  and the operator replies through their own channel. A resolution note is not a
  delivery guarantee.
- Deletion remains a manual operator action; no self-service deletion writer.
- No controlled live inquiry through an outside channel has been exercised.

061 stays open until approved policy text is published.

## Lessons Learned

A contact form without an owner and transport is another nonfunctional subsystem.
