# Session summary: customer policies published (FID-2026-1030-061)

**Session:** 2026-10-30 policy publication
**FID:** FID-2026-1030-061 (open — registered address and Stripe Tax verification)
**Status:** implemented, published, verified

## What the operator asked for

Answer the open policy questions in a single fillable file, then publish the
four policy documents from those answers. The sheet was returned with 41 direct
answers, 18 delegations ("need suggestion", "whatever is legally permitted"),
one optional blank (company identifiers) and one missing sub-item (a registered
address inside the answered legal-entity question). The operator signed H-2
`CONFIRMED` to publish version 1.0.

## What was published

| Version | Document | Current route | Permanent route |
| --- | --- | --- | --- |
| 1.0 | Terms of service | `/terms` | `/legal/v1/terms` |
| 1.0 | Privacy notice | `/privacy` | `/legal/v1/privacy` |
| 1.0 | Refunds and disputes | `/refunds` | `/legal/v1/refunds` |
| 1.0 | Acceptable use | `/acceptable-use` | `/legal/v1/acceptable-use` |

Effective 2026-10-30. Operator `Savant AI`, Kentucky, contact
`spencerhowell84@gmail.com`. The text is `content/legal/v1/*.md`; metadata is
`lib/legal-meta.ts`; rendering is `lib/legal-markdown.ts` +
`components/legal/policy-document.tsx`. Pages are statically prerendered, and the
versioned routes are SSG with `dynamicParams = false`, so an unpublished version
is a 404 rather than a missing page.

## Acceptance, not just notice

- Signup form has a required checkbox; `POST /api/auth/signup` returns 400 with
  a named reason if `acceptedPolicies !== true`, and writes the account and its
  acceptance row in the same request.
- Existing accounts see a card on `/account` until they accept; it posts to
  `POST /api/account/policies` (same-origin, authenticated, current version
  only).
- `policy_acceptances` is keyed `(user_id, version)`, records `source` and the
  timestamp, is idempotent, and cascades when the account is deleted.
- The footer links all four pages on every page that renders it, which is the
  notice path for a customer who never opens the checkbox.

## Answers that could not be published as written

- **"No refunds unless deemed by payment processor"** contradicts the duplicate
  charge answer, and card-network rules require refunding unauthorized and
  duplicate charges. Published: duplicate/erroneous and unauthorized charges are
  refunded, statutory refunds are honoured, everything else is non-refundable.
- **The resale question** was answered with a fair objection: a gateway is
  itself a reseller. Resolved by narrowing the clause — building and selling a
  product on the API is permitted; reselling raw gateway access or handing out
  keys is not.
- **"No liability currently"** is not a usable position. Published: full
  exclusion, a three-month-fee cap where exclusion is not allowed, and a
  carve-out preserving non-waivable rights. The cap is a publisher choice.

## Positions chosen for delegated items

Three-month liability cap; 30-day log retention; 30-day backup retention with an
explicit statement that deletions are not propagated into existing backups;
30-day data-request deadline confirmed by signed-in submission or a reply from
the registered address; rights naming a regulator including the Kentucky
Attorney General; named recipients only, no sub-processor register until a legal
requirement arises; US processing disclosed without an extra safeguard claim; no
voluntary refunds; no credit expiry; promotional credit non-transferable and
revocable; concrete excluded data categories; high-impact decisions only with
qualified human review; review-first enforcement with immediate action for
fraud, legal demands and imminent risk.

Full list with rationale: `docs/policies/README.md`.

## Verification

`npm run verify` exit 0:

- 311 unit tests, including 6 new in `tests/policies.test.mjs` (no unreplaced
  placeholder, decided positions present, version/date/identity agreement,
  route stability, block parsing, inline parsing).
- 421 HTTP checks, 45 new in `scripts/http-suite/policy-checks.mjs`: four pages
  served with the right title, effective date and no placeholder; permanent
  route; unpublished version 404; legal index; footer links; signup refused
  without acceptance; signup acceptance row; account banner when no row exists;
  cross-origin 403; signed-out 401; unknown version 400; account acceptance;
  repeated acceptance; exactly one row.
- Trial HTTP suite PASS; quality PASS (290 files, 400-line ceiling); clean lint,
  typecheck and production build with 12 static/SSG pages.

Two ordering issues were found and fixed while getting the gate green:
`readiness fails closed when storage loses a required table` deliberately drops
the `settings` table, so the policy checks now run before it; and the signup
rate limiter is per client key shared by the whole suite, so the policy checks
use a distinct forwarded address rather than spending the main bucket.

## Remaining

- No registered address is published. Highest priority for a `v2`.
- The tax sentence assumes Stripe Tax is enabled in the Stripe account.
- No lawyer reviewed the text; the operator accepted that position on
  2026-10-30.
- The contact is a personal mailbox, not a role address on an owned domain.
- English only; localisation is a separate future FID with a stated
  authoritative language.

## Follow-up: v1.1 the same day

Two published statements in v1 were wrong, and the operator chose the honest
correction over a convenient one.

**Tax.** v1 said tax is calculated and collected by Stripe where configured. The
Checkout Session in `app/api/account/topup/route.ts` sends only `mode`,
`line_items`, `metadata` and the two return URLs — no `automatic_tax`, no
`tax_id_collection`, no invoice — so Checkout adds no tax. v1.1 states that no tax
is calculated or collected, that no separate invoice or VAT document is issued,
that the Stripe receipt is the payment record, and that the buyer is responsible
for any applicable tax. Enabling Stripe Tax later requires the code change and a
new version together; doing one without the other would make the documents false
in the other direction.

**Registered address.** Asked whether to paste an address, use a registered
agent's, or publish entity and state only, the operator chose the last: the
entity is not registered yet. v1.1 says that plainly, names Kentucky, United
States, and states that a postal address is available on request and will be
printed once one exists. No address was invented.

**Mechanics.** `content/legal/v1.1/` is v1 with terms §3 and §8 and privacy §1
edited; refunds and acceptable use are carried forward unchanged. `v1` remains at
`/legal/v1/<slug>`, marked superseded. `POLICY_VERSIONS` now holds both, the
current version is `v1.1`, and acceptance rows are version-keyed — so a customer
who accepted v1 is asked again, and their v1 row is preserved as history.

**Evidence.** `npm run verify` exit 0: 312 unit tests (7 in
`tests/policies.test.mjs`, one of which asserts v1 still contains the old tax
sentence while v1.1 does not, so an "immutable version" claim is actually
tested), 423 HTTP checks including superseded-version reachability and labelling,
the current version's permanent route, and a legacy v1 acceptance being asked for
v1.1 before both rows are shown to exist.
