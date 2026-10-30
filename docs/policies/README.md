# Customer policies

**Status: version `v1` is published and effective 2026-10-30.** Not reviewed by
counsel; the operator approved the text and signed off on publication. This
directory records the review trail and the publishing procedure. The text that
is actually served lives in `content/legal/`.

## Where the text lives

| Version | Published text (source of truth) | Readable at |
| --- | --- | --- |
| v1 | `content/legal/v1/terms.md` | `/terms`, `/legal/v1/terms` |
| v1 | `content/legal/v1/privacy.md` | `/privacy`, `/legal/v1/privacy` |
| v1 | `content/legal/v1/refunds.md` | `/refunds`, `/legal/v1/refunds` |
| v1 | `content/legal/v1/acceptable-use.md` | `/acceptable-use`, `/legal/v1/acceptable-use` |

`lib/legal-meta.ts` holds the slug, title, version label, effective date,
operator identity and contact. `lib/legal.ts` reads the Markdown at build time;
`components/legal/policy-document.tsx` renders it. The pages are statically
prerendered, so a text change requires a new build.

The pre-publication drafts, with their placeholders and decision markers, are
kept in `drafts/` unchanged as the review history. They are not served.

## Versioning rule

Published text is immutable. A change is a **new version**:

1. Copy `content/legal/v1/` to `content/legal/v2/` and edit only there.
2. Add `v2` to `POLICY_VERSIONS` and move `POLICY_VERSION` / `_LABEL` /
   `_EFFECTIVE_*` in `lib/legal-meta.ts` to the new version.
3. Every account is asked to accept the new version, because acceptance rows are
   keyed by version; old rows stay as the record of what applied before.
4. `/legal/v1/...` stays reachable forever. Never edit a published version in
   place.

## How acceptance is recorded

- **At signup** the form requires a checkbox, and `POST /api/auth/signup`
  rejects a body without `acceptedPolicies: true`. The account and its acceptance
  row are written in the same request; no account exists without one.
- **Existing accounts** see a card on `/account` until they accept, which posts
  to `POST /api/account/policies`.
- `policy_acceptances` stores one row per `(user_id, version)` with the source
  (`signup` or `account`) and the timestamp. Repeating an acceptance is a no-op,
  so the first timestamp stands. Rows cascade with the account.
- The published pages and the footer links are **notice**: a customer who never
  opens the checkbox still sees the policies linked site-wide.

## Positions the operator delegated to the publisher

The answer sheet left these to engineering judgement. They are published as
follows and can be changed in `v2`:

| Topic | Published position |
| --- | --- |
| Liability | Full exclusion, plus a cap at three months of fees where exclusion is not allowed, plus a non-waivable-rights carve-out |
| Log retention | Up to 30 days |
| Backup retention | Up to 30 days, and deletions are stated not to propagate into existing backups |
| Data-request deadline | 30 days after confirmation |
| Rights | Access, correction, export, deletion, explanation; complaint to a consumer or data-protection authority including the Kentucky Attorney General |
| Processor register | Named recipients only; no separate sub-processor list until a legal requirement arises |
| International transfers | Disclosed as US processing, with no additional safeguard claim |
| Refunds | No voluntary refunds; duplicate/erroneous and unauthorized charges and statutory rights excepted; service failures are discretionary credit |
| Credit expiry | None introduced |
| Promotional credit | No cash value, non-transferable, revocable on abuse |
| Excluded data | Health, biometric, genetic, financial account and card numbers, government ids, precise location, children's data |
| High-impact uses | Not as the sole or deciding basis, and only with qualified human review; disclosure where law requires |
| Resale | Building and selling your own product is allowed; reselling raw gateway access or sharing keys is not |
| Enforcement | Review first; immediate only for fraud, legal demand or imminent risk |

## Known gaps

- **No registered address is published.** The operator supplied the entity name
  and jurisdiction only. Add it in the next version; it is the most important
  missing item in `terms.md` and `privacy.md`.
- No counsel review. The operator accepted that position on 2026-10-30.
- The contact address is a personal mailbox, not a role address on an owned
  domain.
- The tax sentence assumes Stripe is configured to calculate and collect tax. If
  Stripe Tax is not enabled in the Stripe account, that sentence overpromises.
- Plan pricing is undecided; the text states that no plan is sold, which matches
  the application.
- English only. Site-wide localisation is a separate future FID, and any
  translation must state which language is authoritative.
- No payment-refund writer exists: card refunds are manual Stripe dashboard
  actions. The refunds page says so.
- Account deletion is a manual operator action; usage events are retained with
  `user_id` nulled, which the privacy notice discloses.
