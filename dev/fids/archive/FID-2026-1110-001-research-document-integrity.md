# FID: Research document integrity, arithmetic and citation repair

**Filename:** `FID-2026-1110-001-research-document-integrity.md`
**ID:** FID-2026-1110-001
**Severity:** medium
**Status:** closed
**Created:** 2026-11-10 18:54
**Automation level:** 3
**YAGNI-Compliance:** Verified

> This record is **registration plus convergence**. The defect inventory is
> complete, the repair contract has passed the Perfection Loop, and the plan is
> approved. **No document has been edited and no code or test has been
> written.** The guard test named under Verification Gates does not exist yet;
> the repository contract permits a planned test path only at `converged`
> status, and it must exist before this record can leave the active queue.

---

## Summary

Two uncommitted research documents,
`docs/research/Wholesale AI Inference Reseller Market.md` and
`research/AI Inference Reseller Strategy.md`, are being treated as evidence in
planning conversations but are not evidence. They contain a financial table
whose net column is arithmetically wrong in all three rows, an executive summary
that contradicts the pricing table eleven lines below it, two code listings that
cannot be executed, a placeholder citation (`unknown_url`) that is the sole
source for the margin argument, base64 PNG blobs standing in for equations, and
recommendations that contradict the repository's actual persistence, payment and
catalog design. They also contradict each other on the one question that matters
most: which supply tier the business rests on.

This record catalogs the defects and the repair contract. It does not adopt
either document as a strategy, and it changes no price, provider, credential or
code path.

## Environment

- **OS:** Windows (win32), bash 5.x shell.
- **Language/Runtime:** Node `22.x` declared by the project; `node -e` used for
  the arithmetic check below.
- **Tool Versions:** Next.js 16 App Router; gates from `protocol.config.yaml`.
- **Commit/State:** both target documents have uncommitted working-tree
  changes, with different baselines. `research/AI Inference Reseller Strategy.md`
  is **tracked and modified** (` M`, 117 insertions over HEAD), so its pre-edit
  state is recoverable with `git diff`. `docs/research/Wholesale AI Inference
  Reseller Market.md` is **untracked** (`??`) and has no baseline at all; a lost
  edit there is unrecoverable. The implementation slice must commit both.

## Detailed Description

### Problem

The documents mix correct arithmetic with incorrect arithmetic, present vendor
marketing as measurement, and describe a system that is not this repository.
Nothing in the gate set examines either file: `scripts/quality-report.mjs` scans
`app/`, `components/`, `config/` and `lib/` only, and `npm test` covers
`tests/*.test.mjs`. A reader has no signal separating the sound parts from the
unsound ones, and the defects are not cosmetic — the strategy document's
recommendations would regress the ledger if followed.

### Expected Behavior

Each document states its provenance and date, distinguishes measured facts from
vendor claims, computes every financial figure by one stated method that
reproduces, contains no placeholder citations, contains code that runs or is
explicitly labeled illustrative, and either matches this repository's design or
names itself as superseded on the points where it does not.

### Root Cause

Both documents were produced by a generated survey pass: uniform sentence
rhythm, dense footnote markers, escaped-character damage (`\$`, `\#`, `\\_`),
base64 images where formulas belong, and citations assigned per clause rather
than per source. The generator optimizes for the appearance of evidence, so
claim density and citation density rise while claim verifiability does not. No
step in authoring tied a figure back to a computation or a claim back to a
measurement.

### Evidence

**E1 — Strategy P&L net column.** The table computes
`Net Operating Margin (Post-Hosting)` as GMV minus fixed cost, while the prose
directly beneath it computes gross profit at a 50% margin. Recomputing both
methods:

```text
$ node -e '<rows: paid users, GMV, fixed cost; margin 50%>'
cohort | paid | GMV | m50% | minusFixed | doc claim | delta
10 users | 1 | $12 | $6.00 | $-9.00 | $-3 | $6.00
100 users | 4 | $48 | $24.00 | $9.00 | $33 | $24.00
1000 users | 25 | $300 | $150.00 | $115.00 | $185 | $70.00
```

Every row disagrees with a gross-profit computation. The 1000-user row's own
prose supports $100 ($150 gross margin − $30 package − $20 infrastructure), not
the $185 printed in the table.

**E2 — Same document, two retail prices.** The executive blueprint prices Claude
Sonnet at `$0.80` per 1M tokens and derives `$12.00` GMV on 15M tokens; the
pricing table prices it at `$0.850` at 2.12x. `15M × $0.80 = $12.00` and
`15M × $0.85 = $12.75`, so the two sections cannot both be current.

**E3 — Placeholder citation.** In both documents, source 9 is
`[unknown_url](http://docs.google.com/unknown_url)`. In the strategy document it
is the only source attached to the 1.3x → 23.08% margin argument and to the P&L
rows.

**E4 — Unexecutable listings.** `docs/research/Wholesale AI Inference Reseller
Market.md` contains a LiteLLM YAML block and a Python "canary daemon" block,
both carrying **single** renderer escape artifacts (`\#`, `\_`, `\=`, `\:`),
verified with `sed … | cat -A` rather than inferred. Inside a fenced block
markdown does not process escapes, so the backslashes reach the reader verbatim;
`\# 1\.` is a Python **syntax error**, not a comment, and `model\_name:` is not
a YAML key. The function named for cryptographic verification is:

```text
def verify_against_official_api(signature_block, official_auth_key):
    """Simulates validation..."""
    return bool(signature_block and len(signature_block) >= 500)
```

A verification daemon that performs a length check and says so in its docstring
is a placeholder presented as a working feature.

**E5 — Base64 equations.** Four `data:image/png;base64` blobs
(`[image1]`–`[image4]`) carry the multiplier and completion-ratio formulas. The
formulas cannot be read, reviewed or grepped in the source.

**E6 — Citation laundering.** In the market document, citation 1 is the Apixo
storefront and is attached to claims about the whole ecosystem's discount band
and lab participation; dozens of distinct empirical claims route to citation 2,
a single blog post. In the strategy document, `apinex.bond/guides`, `/pricing`,
`/benchmarks`, `/status` and `/resell` are cited as authority for wholesale
prices, model authenticity and uptime — the counterparty grading itself.

**E7 — Repository contradictions (strategy document).**

- Recommends `better-sqlite3` with WAL and balance reservations held in a
  process-local `Map`. This repository is PostgreSQL over `pg`, with the ledger,
  reservation and settlement in `lib/storage/` and `lib/storage/gateway/`, and
  it enforces a two-connection debit proof (`npm run test:postgres`). A
  process-local Map ledger regresses durability.
- Declares Stripe a "Rejected Alternative" while the repository ships
  Stripe-confirmed top-ups **and** NOWPayments (`lib/stripe.ts`,
  `lib/nowpayments.ts`, `app/api/webhooks/`).
- Prices "Claude Sonnet 5.5", "GPT-6 Luna", "GPT-6.1 Sol" and "DeepSeek V4.1
  Flash". Catalog identity comes from provider-scoped sync; these are not
  catalog ids this gateway produces and none is verified to exist.
- Presents Altcha proof-of-work, a 100,000-token account cap and pool-state
  shedding as new work, without noting that `lib/gateway-rate-limit.ts` and the
  `free` group billing mode already implement admission control in a different
  shape.

**E8 — Documents contradict each other.** The market document classifies the
0.05x–0.2x supply tiers (credit farming, reverse-engineered IDE sessions, pooled
consumer subscriptions) as fraud and Terms-of-Service violation, and directs
that such endpoints must never carry proprietary source code. The strategy
document selects autonomous coding agents as the launch market — payloads that
are entirely proprietary source code — and builds its cost basis on the
wholesale prices those tiers produce, without ever naming which supply tier it
assumes. Both statements cannot govern the same plan.

**E9 — Unmeasured precision.** Statements such as "crypto-only billing reduces
initial signup conversion by an estimated 50% to 70%" carry no method, sample or
date. The same applies to the `$0.005 per 1M tokens` subscription-pool figure
and the "~800ms" proof-of-work cost.

## Impact Assessment

### Affected Components

- `docs/research/Wholesale AI Inference Reseller Market.md` (uncommitted).
- `research/AI Inference Reseller Strategy.md` (uncommitted).
- `dev/fids/README.md` and `SCOPE.md` registers.
- Planned guard: `tests/research-documents.test.mjs`.

### Risk Level

- [x] Medium: no runtime path is affected, but the documents are load-bearing
  input to commercial and architectural decisions, and one of them recommends a
  ledger design that the repository has already replaced for correctness
  reasons. Workaround exists: treat both as unverified drafts.

## Proposed Solution

### Approach

Repair the documents in place; add no production code. Every correction is one
of four kinds — recompute a figure, re-attribute a claim, convert damage to
valid source, or label a statement as superseded. Claims that cannot be tied to
a primary measurement are either labeled as the vendor's own claim or removed;
they are not restated with softer wording.

Add one mechanical guard so the same damage cannot return silently.

### Steps

1. **Provenance header on both documents.** Authoring date, method (generated
   survey), verification status, and an explicit scope statement: not a
   measurement, not legal advice, not a description of this repository except
   where a section says so.
2. **Recompute the strategy P&L.** One stated method: `gross = GMV × margin`,
   `net = gross − fixed`. Recompute all three rows, reconcile the `$0.80` /
   `$0.850` retail price to a single figure, and re-derive the breakeven
   conversion rates from the corrected net values.
3. **Resolve placeholder and dependent citations.** Replace source 9 with a real
   source or delete every claim that depends on it, including the 1.3x margin
   derivation if no primary source replaces it.
4. **Re-attribute empirical claims.** Write both reference lists as a table with
   one row per claim class: primary measurement (date and method), vendor
   self-claim (labeled as such), or unsupported (removed). Vendor marketing
   pages may remain cited, but only as vendor claims.
5. **Convert equations to text.** Replace `[image1]`–`[image4]` with plain-text
   formulas so they are readable and reviewable in source.
6. **Repair or relabel code.** Remove the renderer escape artifacts (`\#`, `\_`,
   `\=`, `\:`) so every fenced block is valid source. Delete the non-verifying `verify_against_official_api`
   function and its daemon, or relabel the block "illustrative, not runnable"
   and drop the executable framing. A block that cannot be made honest is
   removed rather than softened.
7. **Reconcile the strategy document against the repository.** Mark the
   persistence, payment and free-tier sections as superseded, name what the code
   actually does (`lib/storage/`, `lib/storage/gateway/`, `lib/stripe.ts`,
   `lib/nowpayments.ts`, `lib/gateway-rate-limit.ts`, `free` group mode), and
   remove model names that provider-scoped sync does not produce.
8. **State the supply-tier assumption.** Make the strategy document name which
   supply tier its cost basis assumes, and record the market document's
   fraud/ToS classification of the cheap tiers against it. This is a disclosure
   requirement, not a sourcing endorsement.
9. **Add the guard test.** `tests/research-documents.test.mjs` asserts, for both
   documents: no `unknown_url` or empty link target; no `data:image` blob; no
   renderer escape artifact (`\#`, `\_`, `\=`, `\:`, `\.`) inside a fenced block;
   and a present provenance header naming the method and verification status.

### Verification

GREEN evidence must include: the corrected P&L table recomputed by pasted
command output, with the method named in the table caption; zero placeholder
links in either document; fenced blocks free of double escapes; no base64
images; a provenance header in each document; and
`tests/research-documents.test.mjs` passing under `npm test`.

Honest boundary: correcting claims about wholesale prices, model existence,
uptime and discount bands requires a **primary measurement**, which needs a live
provider endpoint and credential and is a separate read-only action. If that
measurement is not performed, the affected claims are labeled unsupported or
removed — they are not upgraded to fact by editing. No funded inference is
required or authorized by this record.

### YAGNI

No new document, no new directory, no production module, no new dependency. The
guard test is the only new file. The two documents keep their existing paths.

## Verification Gates

- gate: test tests/research-documents.test.mjs
- gate: lint
- gate: typecheck
- gate: attribution — `npm run attribution`, because both documents are inside
  the document guard's scope.
- gate: repository:check — `npm run repository:check`, for register and link
  consistency after the reference-list rewrite.

`- gate: quality` is not claimed: the 400-line ceiling scans `app/`,
`components/`, `config/` and `lib/`, and this record touches none of them.
`- gate: build` is not claimed for the same reason: no application module
changes.

### Verification Receipt

- verified: not yet — registration only. No document edited, no test exists.

## Perfection Loop

### Loop 1 — RED

- **RED:** E1 (P&L net column computed from GMV, contradicting the gross-profit
  prose), E2 (two retail prices in one document), E3 (placeholder source 9),
  E4 (unrunnable listings and a non-verifying "verification" function), E5
  (base64 equations), E6 (vendor marketing cited as measurement), E7 (four
  contradictions with this repository), E8 (the two documents contradict each
  other on supply tier), E9 (unmeasured precision).
- **GREEN:** the nine repair steps under Proposed Solution.
- **AUDIT:** every claim in E7 was checked against the tree, not assumed.
  `lib/stripe.ts`, `lib/nowpayments.ts`, `lib/gateway-rate-limit.ts` and
  `lib/storage/gateway/{call,paid,payload,provider-call,resolution,settle,stream}.ts`
  all exist. `protocol.config.yaml` `quality.scan` is `app`, `components`,
  `config`, `lib`, and `scripts/quality-report.mjs` walks exactly those roots —
  so the quality gate genuinely cannot see either document. E1's arithmetic was
  recomputed by command, not by inspection.
- **ADVERSARIAL:** the record's own Environment section was **wrong**: it
  claimed both documents were untracked. `git status --porcelain` shows
  ` M` for the strategy document, which is tracked with 117 uncommitted
  insertions, and `??` only for the market document. A record that demands
  precise claims cannot itself ship an imprecise one. Corrected in this pass.
- **CHANGE DELTA:** registration draft to Loop 1 draft, measured below.

### Missed Questions

1. **Are these documents referenced by any gate, doc index or code path?** They
   are not in `docs/README.md`'s index reach and no script reads them; the guard
   test is therefore the only enforcement, which is why step 9 exists.
2. **Should the documents simply be deleted?** Deletion is a scope and intent
   decision that belongs to the operator. This record repairs what is present;
   it does not remove approved material.
3. **Does repairing the arithmetic make the business case valid?** No. The
   corrected 1000-user row is $100 net, not $185, and the remaining exposure is
   the unmeasured supply and conversion claims (E8, E9).
4. **Does this record adopt the strategy?** No. It edits documents. Prices,
   providers, groups and plans are untouched.
5. **Can the guard test be gamed by reformatting?** Yes — it checks mechanical
   corruption, not truth. Fraudulent-but-tidy prose still passes. That limit is
   stated in the test's own header rather than hidden, and truth remains a
   review obligation.
6. **Are the two files at risk of being lost before repair?** Partly. The
   strategy document is tracked and dirty, so `git diff` recovers it. The market
   document is untracked and has no baseline; a bad edit is unrecoverable.
   Committing the repaired versions in the implementation slice is the
   mitigation, and it is why this record exists before any edit.

### Loop 2 — Independent audit and self-correction

- **RED:** three weaknesses survived Loop 1. Step 6 offered two dispositions
  ("delete or relabel") without a rule to choose between them. The guard test in
  step 9 was under-specified: a global search for `\\#` would reject legitimate
  escaped content in prose, and a search that does not confine itself to fenced
  blocks cannot tell damage from an intentional backslash. The provenance header
  in step 1 had no required fields, so "present" would be unverifiable.
- **GREEN:** step 6 now has a decision rule — a block that claims to verify or
  execute is **deleted**, a block that is purely illustrative may stay only
  after the executable framing and the fake function are removed. Step 9 confines
  every escape check to the interior of a fenced block and names the required
  header fields. Step 8 gained a disclosure requirement rather than a sourcing
  verdict, because this record has no authority to rule on what the operator may
  sell.
- **AUDIT:** the convergence was also checked against the repository contract —
  `npm run repository:check` allows an active record only at `converged` or
  `fixed`, and exempts `converged` records from the on-disk test-path rule. The
  record is therefore registered as `converged` with its test path declared and
  absent, which is the contract's documented pre-implementation state.
- **ADVERSARIAL:** repairing the arithmetic makes the documents *more*
  persuasive without making them *more verified*. The corrected 1000-user row is
  still a projection resting on unmeasured conversion, and a tidy document can
  launder a weak premise. Defense: the provenance header must state that no
  figure here is a measurement, and E8's supply-tier disclosure must survive
  into the repaired text, not be tidied away.
- **CHANGE DELTA:** Loop 2 corrections are confined to steps 1, 6, 8 and 9 and
  the loop record; measured below.

### Loop 3 — Final convergence

- **RED:** residual risk that the guard test creates false confidence, and risk
  that the repair is judged done while E6/E9 claims remain unsupported.
- **GREEN:** the guard test's own header states its limit — it detects mechanical
  corruption, not truth. The repair is not complete until every empirical claim
  is either measured, labeled a vendor claim, or removed; unsupported claims are
  not softer-worded.
- **AUDIT:** no further defects found in the repair contract. Every one of the
  nine steps maps to a defect class E1–E9 and to a gate.
- **Post-convergence correction (implementation pass):** E4 originally described
  the code-fence damage as *double* escapes (`\\#`). `sed -n … | cat -A` on the
  raw file shows **single** escapes (`\#`, `\_`, `\=`, `\:`); the doubled form
  came from JSON encoding in the tool output that first read the file. E4 and
  steps 6 and 9 now state the verified form. No other finding changed.
- **ADVERSARIAL:** a reviewer could implement steps 1–7 and 9, skip step 8, and
  leave the documents mutually contradictory while all gates pass. Mitigation:
  step 8 is a review obligation, stated here because no gate can enforce it.
- **CHANGE DELTA:** 0% in this pass; converged.

> **Measured document deltas.** Registration draft 16,590 bytes; converged
> record 21,464 bytes, a combined +4,874 bytes (+29.4%). The whole-document
> delta across Loops 1–3 exceeds the 10% per-pass cap because the registration
> draft carried the defect inventory only and had no GREEN, AUDIT or ADVERSARIAL
> content to revise incrementally; the additions are the loop record itself.
> The figure is a whole-document measurement, not a per-pass derivation, and it
> is disclosed rather than hidden, on the same basis as the 2026-11-05 AE1 and
> 2026-11-06 MC1 entries in `SCOPE.md`.

### Implementation Evidence (REQUIRED for `closed`)

- [x] **Commit SHA:** `f6ecba307253cba5dd407cac0beaf52df62c5bbf`
- [x] **File:line ranges:** `docs/research/Wholesale AI Inference Reseller
  Market.md:3-13` (provenance), `:86-100` (text formulas), `:200-232` (fenced
  YAML with placeholder relays), `:271-299` (integrity checks replacing the
  daemon), `:301-318` (evidence status); `research/AI Inference Reseller
  Strategy.md:3-16` (provenance), `:57-58` (retail reconciliation), `:64`
  (generic model label), `:147-148` (recomputed P&L), `:206-229` (superseded
  SQLite premise, fenced), `:349-366` (supply-tier disclosure), `:402-419`
  (evidence status); `tests/research-documents.test.mjs:1-166`.
- [x] **Gate output:** `npm test` exit 0 — 1,134 tests, 1,118 pass, 0 fail, 16
  environment-gated skips; `npm run lint` exit 0; `npm run typecheck` exit 0;
  `npm run attribution` PASS (both guards); `npm run repository:check` PASS.
- [x] **Reproducibility:** `grep -n 'Provenance\.' docs/research/*.md research/*.md`
  and `node --test tests/research-documents.test.mjs` (7/7) locate the change.
- [x] **Step statuses:** steps 1-4, 6, 8 and 9 `implemented`; step 7 `implemented`
  (model ids removed from the pricing table, fabricated counts removed from
  roadmap titles, architecture sections marked superseded); step 5 `implemented`
  for the equation conversion, with the separate base64-deletion sub-item
  `dropped::operator-approved 2026-11-10 — "Keep them; record the residual"`.

**Step 5 residual, recorded rather than hidden.** The four formulas are text in
both documents and no `![][imageN]` reference remains, so nothing is carried as
an image any more. Thirteen orphan `[imageN]: <data:image/png;base64,…>`
definitions (about 24 KB) still sit at the ends of the two files, referenced by
nothing. Removing them requires reproducing roughly 24,000 base64 characters in
an exact-match edit, and the only dependable alternative is a line-targeted
scripted deletion, which Law 1 reserves to an operator ruling. The operator
declined that ruling on 2026-11-10 and directed that they be kept and the
residual recorded. The guard test therefore enforces "no image reference" and
"no image-carried formula", which are the reachable forms of E5.

### Code Verification Evidence

- [x] Both target documents read 0-EOF in the registering session and again
  during implementation.
- [x] The arithmetic in E1 recomputed from the printed table values, and the
  corrected rows asserted by `tests/research-documents.test.mjs`.
- [x] The repository contradictions in E7 checked against `package.json`,
  `AGENTS.md` and the `lib/` layout named above.
- [x] Status reflects reality: `closed`, with the step 5 sub-item and its
  operator ruling stated above.
- [x] Register contracts accept the record: `npm run repository:check` PASS and
  `npm run attribution` PASS.
- [ ] **Discovered defect, fixed in the same pass:**
  `tests/store-customer-batch-postgres.test.mjs` pinned `NOW` to
  `2026-10-31T12:00:00.000Z`, while `resolveCustomerSession` compares expiry
  against the real clock with a 7-day TTL. Ten days later the fixture's session
  was born expired and the suite failed with `Cannot read properties of null
  (reading 'id')`. The constant is now relative to the run clock
  (`:46-51`); the file passes 12/12 and the assertion was not weakened.

## Resolution

- **Closed Date:** 2026-11-10 20:01
- **Fix Description:** Both research documents now carry provenance and claim
  classification; the strategy P&L is recomputed by one stated method and its
  retail price reconciled with the pricing table; the strategy's persistence,
  payment and free-tier claims are marked superseded against the implemented
  design; the market document's equations are text; the non-verifying canary
  daemon is deleted; the supply-tier assumption is disclosed. A mechanical
  guard test prevents the escape, fence and placeholder damage from returning.
- **Tests Added:** Yes — `tests/research-documents.test.mjs` (7 assertions) and
  the date-relative fixture fix in `tests/store-customer-batch-postgres.test.mjs`.
- **Verification Evidence:** lint 0, typecheck 0, `npm test` 1,118 pass / 0 fail
  / 16 environment-gated skips, attribution PASS, repository check PASS.
- **Archived:** 2026-11-10 20:01

## Lessons Learned

Dense citation markers are not evidence. A document that assigns a footnote to
every clause can still route its central financial claim to a broken placeholder
and its ecosystem claims to a storefront. The check that catches this is not
"does every paragraph have a citation" but "does every figure reproduce under a
stated method, and does every empirical claim name a measurement or admit that
it is a vendor's own claim". Two documents written in the same pass should also
be read against each other before either is used: these two disagree on whether
the chosen customer can be served safely by the chosen supply.
