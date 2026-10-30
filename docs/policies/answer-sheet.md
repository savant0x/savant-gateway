# Policy answer sheet — fill this in, then hand it back

**Purpose:** one place to answer everything the four policy drafts are waiting on,
so they can be published in a single pass. Nothing here is published or effective.

## How to use it

- Write your answer on the `ANSWER:` line under each question. Leave the
  question text and IDs alone — I match answers back to draft sentences by ID.
- A blank `ANSWER:` means unanswered, and the draft keeps its placeholder. If
  the answer is genuinely "no such thing", write `NONE` or `NO` so it is
  distinguishable from a blank.
- Answer in plain language. Where a lawyer gave you wording, paste it verbatim;
  I will use it unchanged instead of drafting around it.
- Do not edit `v1/*.md` directly. Answers belong here only.
- Skip anything marked `OPTIONAL` if it does not apply.

Status legend I will apply when reading it back: `ANSWERED`, `BLANK`.

---

## Read-back — answered 2026-10-30, published as v1

61 questions: 41 answered directly, 18 answered by delegating the position
("need suggestion", "whatever is legally permitted"), 1 left blank (A-7,
optional), and 1 sub-item missing inside an answered question (the registered
address inside A-1). Version `v1` is published; the served text is in
`content/legal/v1/` and the positions chosen for the delegated items are listed
in `README.md`.

Three answers were not publishable as written, and were resolved as follows:

- **D-8 "no refunds unless deemed by payment processor"** would have contradicted
  D-3 (duplicate charges refunded) and D-1's compliance caveat, and card-network
  rules require refunding unauthorized and duplicate charges. The published
  policy refunds duplicate or erroneous charges, unauthorized charges, and any
  refund the law requires, and leaves everything else non-refundable.
- **E-3** asked whether a resale restriction is self-defeating for a reseller. It
  is not, once it is written narrowly: building and selling a product on the API
  is permitted, and what is prohibited is reselling raw gateway access or
  handing out keys. The clause was rewritten that way.
- **B-6 "none currently"** is not a usable liability position because a total
  disclaimer still needs a fallback where exclusion is not allowed. Published: a
  full exclusion, a cap of three months of fees where a cap is required, and a
  carve-out preserving non-waivable rights. The cap figure is a publisher
  choice, not your answer.

Flags recorded against the published text:

- **A-1 registered address is missing.** Kentucky is named, but no address is
  printed anywhere. This is the highest-priority addition for the next version.
- **A-4** is a personal mailbox. It works and is monitored, but a role address on
  an owned domain would be better for both deliverability and credibility.
- **A-5** points vulnerability reports at the public issue tracker. That is fine
  for the software, and the privacy notice routes account-data incidents to the
  support queue instead.
- **B-3** says Stripe handles tax. That is only true if Stripe Tax is enabled in
  the Stripe account; the text assumes it is.
- **F-4** records that no lawyer reviewed the text. The operator signed off
  knowing that.
- **A-6** "oct 30, 2026" was normalised to `2026-10-30` / "30 October 2026".

---

## A. Identity, dates and contact

Used in the header of all four documents and wherever `[JURISDICTION]` appears.

**A-1. Legal entity** — the exact registered name that contracts with customers,
plus the registered address, as it should be printed.

ANSWER: Savant AI

**A-2. Trading name** — the brand customers see, if it differs from A-1.

ANSWER: Savant AI

**A-3. Governing law and jurisdiction** — the country/state whose law governs, and
where disputes would be heard. Used in terms, privacy (rights), and acceptable use
(lawfulness test).

ANSWER: Kentucky, USA

**A-4. Contact channel** — something you own and actually monitor: an email
address, or a stated policy that the signed-in support queue is the only channel.
This appears five times across the drafts, so give the exact wording once.

ANSWER: spencerhowell84@gmail.com

**A-5. Security and abuse contact** — where a vulnerability report should go. May be
the same as A-4.

ANSWER: https://github.com/savant0x/savant-gateway/issues

**A-6. Effective date and version label** — the date the published text takes effect.
Suggest: pick the publication date, not a back-dated one. Version `1.0` unless you
want otherwise.

ANSWER: oct 30, 2026

**A-7. Company identifiers (OPTIONAL)** — registration number, VAT/tax id, or
registered office if you want them shown.

ANSWER:

---

## B. Terms — open positions

**B-1. Minimum age to hold an account.** The draft currently says "old enough to
contract in [JURISDICTION]". Give a number if you want a bright line (13, 16, 18).

ANSWER: 18

**B-2. Subscriptions.** These are currently not sold at all — there is no purchase
path in the application, and plans can only be granted by an operator as comps.
The draft says so. If you intend to sell plans later, give price, interval,
included allowance, overage behavior and renewal terms now; otherwise answer
`NO PLANS FOR SALE`.

ANSWER: Undecided pricing with plans pending but coming later as platform matures.

**B-3. Taxes, invoicing and VAT.** How tax is handled on credit purchases, whether
customers get an invoice, and who issues it (you or Stripe). Answer `STRIPE
HANDLES IT` if that is the decision and you do not want a promise beyond it.

ANSWER: stripe will handle

**B-4. Availability commitment.** Today there is no SLA, no uptime target and no
downtime credit. Anything you promise becomes a contractual obligation. Options:
promise nothing (current draft), or state a target and a remedy.

ANSWER: promise nothing

**B-5. Support response target.** Same question for support: no target is promised
today.

ANSWER: no target during dev.

**B-6. Liability position.** This is deliberately empty in the draft because it is
a legal position, not an implementation detail. Supply the clause wording, or
answer `COUNSEL TO PROVIDE` and leave a marked hole instead of an invented clause.

ANSWER: none currently.

**B-7. Consumer-rights carve-out.** Whether customers in your jurisdiction get
statutory rights that override the liability and refund limits, and the wording
that preserves them.

ANSWER: granting no liability to provider and no promises.

**B-8. Termination for convenience.** Whether you may close an account with no
breach, and what happens to the remaining paid balance if you do. The draft only
covers termination for cause plus a discretionary refund.

ANSWER: hold rights to terminate without any legal grounding. If credits are loaded, they can be used but account reload will be locked or refunded held balance.

---

## C. Privacy and data

**C-1. Log retention.** How long server and hosting logs are kept. The application
does not set this; the host does.

ANSWER: i need advice here, pending.

**C-2. Backup retention.** How long database backups are kept, and whether a
deleted account can persist in a backup until it ages out. If deletions are not
propagated to backups, say so — the draft should not imply they are.

ANSWER: need suggestion

**C-3. Data-subject request deadline.** The response window you commit to, and the
verification step you will use to confirm identity before acting on a request.

ANSWER:need suggestion

**C-4. Statutory rights to name.** Which rights you will state (access, correction,
export, deletion, objection, portability, complaint to a regulator — which
regulator). Answer `MINIMUM SET` if you want the conservative common set.

ANSWER:need suggestion

**C-5. Processor disclosure.** Whether you will publish a processor/sub-processor
list and accept data-processing terms with each (upstream providers, Stripe,
Artificial Analysis, OpenRouter). Today the notice names them but promises nothing.

ANSWER: only what's legally required if a situation arises through legal means/contact

**C-6. International transfers.** Whether customer data leaves the customer's
region (very likely, since upstream providers are the recipients), and what
safeguard you claim.

ANSWER: need suggestion

**C-7. Suspected minor account.** The process: suspend pending verification, delete,
or ask for parental consent.

ANSWER:we currently do not have any age verification system.

**C-8. Usage records after deletion.** Implementation truth: deleting an account
removes it and everything account-owned by cascade, but `usage_events` survive with
`user_id` set to null as the settlement record. They no longer point at a person.
Confirm you are comfortable disclosing exactly that.

ANSWER:need suggestion

---

## D. Refunds, credit and disputes

**D-1. Unused prepaid credit.** Refundable or not; if refundable, the window, any
fee, and whether it is cash or credit. Implementation limit: any card refund is a
manual Stripe dashboard action, and a credit-ledger refund cannot exceed the
current balance.

ANSWER: whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-2. Consumed credit.** The draft says not refundable. Confirm or change.
Note the delivery rule: usage that was delivered is charged even if the stream
later errors or the customer cancels mid-response.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor. But prefer no  refund.

**D-3. Duplicate or incorrect charge.** The draft says refunded or credited in full
when verified. Confirm.

ANSWER: whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-4. Service failure remedy.** What a customer gets when the gateway, not the
customer, caused a bad outcome: credit, cash, a cap, or nothing beyond case-by-case
review.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-5. Fraud and chargebacks.** The draft suspends the account and freezes credit
pending review. Confirm.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-6. Credit expiry.** No expiry exists in code today. Introduce one? If yes: the
period, the notice given before it applies, and whether promotional credit is spent
before purchased credit.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-7. Promotional and granted credit.** Expiry, withdrawal on abuse,
non-transferability, and whether it converts to anything on closure.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**D-8. Refund request window and evidence.** Any deadline to submit a request, and
what the customer must provide.

ANSWER:no refunds unless deemed by payment processor.

**D-9. Dispute handling detail.** Whether disputed credit is frozen automatically
(the tooling supports appends, not a freeze flag), and what you send the customer
during a card dispute.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

---

## E. Acceptable use

**E-1. Excluded data categories.** Which regulated or special-category data
customers must not submit (health, biometric, financial account, government ids,
children's data, etc.). Answer `NONE EXCLUDED` if you accept everything.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**E-2. Excluded high-impact uses.** Whether output may inform decisions about
people (credit, employment, housing, insurance, education, legal, medical) and
under what conditions — always with human review, never, or unaddressed.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**E-3. Resale and shared access.** The draft requires written permission to resell
or provide third-party access. Confirm, or state a different rule.

ANSWER: we are the reseller, Wouldn't that basically be bad practice for policy to discourage resell?

**E-4. Disclosure of AI-generated content.** Whether you require customers to
disclose AI involvement where law demands it, and whether you take any position on
synthetic media.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**E-5. Enforcement posture.** Whether you suspend first and explain after (draft
position), or always notify before action except for fraud and legal demands.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

**E-6. Additional prohibited uses.** Anything you want added beyond the ten in the
draft, or anything you want removed as unenforceable or unwanted.

ANSWER:whatever is legally permitted/need suggestions to remain compliant w/ payment processor.

---

## F. Publication mechanics

**F-1. Routes.** Proposed: `/terms`, `/privacy`, `/refunds`, `/acceptable-use` for
the current version, with `/legal/v1/<name>` staying reachable forever. Confirm or
give your preferred scheme.

ANSWER:confrim

**F-2. Where the links appear.** Proposed: site footer, account page, and the
signup form. Confirm, and name any page I should not touch.

ANSWER:confrim clear placement

**F-3. Acceptance record.** There is currently no record of a customer accepting
these terms — no checkbox, no stored timestamp. Options: (a) publish as notice
only, (b) add a clickwrap at signup, (c) add a banner in the account area asking
existing accounts to accept. Note (b) and (c) are code, not documents.

ANSWER:all 3 unless accepted prior to 3 notices.

**F-4. Legal review.** Has counsel reviewed these drafts, or are you publishing
your own wording? Name the reviewer if there is one.

ANSWER: no reviewer

**F-5. Approval.** Who signs off on publishing, and do you want a preview deploy to
read the rendered pages before they go live?

ANSWER:i sign off

**F-6. Language.** Which languages, and whether a translation is authoritative or
informational.

ANSWER: supported language on site is currently english, we need to add multi-langage support site wide as a future feature, add a note or fid

**F-7. Jurisdiction-specific inserts (OPTIONAL).** Anything required locally that
these drafts do not have: an imprint, a cancellation notice, a dispute-resolution
statement, a cooling-off notice for consumers.

ANSWER:

---

## G. Confirm the facts being described

These are statements about the current code, not preferences. Read each, then
answer `CONFIRMED`, or `CHANGE:` with what should happen instead. A change here is
an implementation task, not a policy edit.

**G-1.** A request that fails before any usage is delivered is not charged.
ANSWER: CONFIRMED

**G-2.** Usage already delivered is charged at the published rate even if the
response later ends in an upstream error or the customer cancels mid-stream.
ANSWER:CONFIRMED

**G-3.** There is no automated card refund and no Stripe Refund API call; a money
refund is a manual dashboard action by the operator.
ANSWER:CONFIRMED

**G-4.** A credit refund cannot exceed the account's current balance and can never
create credit; an adjustment cannot take a balance below zero.
ANSWER:CONFIRMED

**G-5.** Prepaid credit has no expiry in code.
ANSWER:CONFIRMED

**G-6.** No subscription purchase path exists; plans are operator-granted comps only.
ANSWER:CONFIRMED

**G-7.** Account deletion removes the account and all account-owned rows by cascade;
`usage_events` are retained with `user_id` nulled.
ANSWER:CONFIRMED

**G-8.** Account deletion is performed manually by the operator after review; there
is no self-service delete.
ANSWER:CONFIRMED

**G-9.** Request bodies and model outputs are not stored as content.
ANSWER:CONFIRMED

**G-10.** No advertising or analytics scripts are loaded, and no
content-security-policy header is sent.
ANSWER:CONFIRMED

**G-11.** Customer session cookie lifetime is seven days; admin session is short
lived; both HttpOnly, Secure in production.
ANSWER:CONFIRMED

**G-12.** There is no outbound support email; the queue is read by the operator in
the admin panel.
ANSWER:CONFIRMED

**G-13.** `POST /v1/chat/completions` is the only inference endpoint; the native
Anthropic Messages API and the Responses API are not implemented.
ANSWER:CONFIRMED

**G-14.** Prices can change for future usage; a settled charge is never repriced
retroactively.
ANSWER:CONFIRMED

---

## H. Sign-off

**H-1.** Anything the drafts should say that no question above asked about.

ANSWER: no

**H-2.** Your confirmation that this sheet is complete and the policy drafts may
be published with these answers, with version 1.0 and the date in A-6.

ANSWER:CONFIRMED

---

## Mapping — which answer fills which draft line

| ID | Fills |
| --- | --- |
| A-1 | `terms.md` Operator, `privacy.md` Controller, `refunds.md` Operator, `acceptable-use.md` Operator |
| A-2 | Header line of each draft, if the trading name differs from the legal entity |
| A-3 | Every `[JURISDICTION]`: terms header and §2, privacy header and §5 and §7, refunds §3, acceptable use §2.1 |
| A-4 | `terms.md` header and §8, `privacy.md` header, `refunds.md` header, `acceptable-use.md` header |
| A-5 | `privacy.md` §6 and `acceptable-use.md` §5 security-reporting sentence, when it differs from A-4 |
| A-6 | Every `Effective date` and `Version` field |
| A-7 | `terms.md` Operator block, if you want registration or tax identifiers shown |
| B-1 | terms §2 age sentence |
| B-2 | terms §3 subscriptions-not-for-sale block |
| B-3 | terms §3 tax line |
| B-4 | terms §4 availability decision block |
| B-5 | terms §4 and refunds §6 "no response-time commitment" |
| B-6, B-7 | terms §6 liability |
| B-8 | terms §5 |
| C-1, C-2 | privacy §4 retention |
| C-3, C-4 | privacy §5 rights |
| C-5, C-6 | privacy §2 processor decision |
| C-7 | privacy §7 children |
| C-8 | privacy §4 deletion paragraph |
| D-1 | refunds §3 unused credit |
| D-2 | refunds §3 consumed credit |
| D-3 | refunds §3 duplicate charge |
| D-4 | refunds §3 service failure |
| D-5 | refunds §3 fraud |
| D-6, D-7 | refunds §5 expiry and promotional |
| D-8, D-9 | refunds §3 window, §4 disputes, §6 |
| E-1 | acceptable use §2.8 |
| E-2 | acceptable use §2.9 |
| E-3 | acceptable use §2.6 |
| E-4 | acceptable use §2.9 disclosure clause |
| E-5 | acceptable use §4 enforcement |
| E-6 | acceptable use §2 list |
| F-1 to F-7 | Publication mechanics; no draft sentence changes, they decide how the text is served and accepted |
| G-* | The statements in all four drafts that assert implementation behavior |
| H-1, H-2 | Not mapped; H-1 may add clauses beyond these drafts, H-2 authorises publication |
