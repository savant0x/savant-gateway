# FID: Policy v1.2 for the current service surface

**Filename:** `FID-2026-1104-011-policy-v1-2-publication.md`
**ID:** FID-2026-1104-011
**Severity:** high
**Status:** converged
**Created:** 2026-11-04 17:10
**Automation level:** 1
**YAGNI-Compliance:** Verified

## Summary

Published policy `v1.1` predates the current service surface. It names Stripe but
not NOWPayments, account email delivery, Signal saves, comments and reactions, or
Vercel Speed Insights. Published text is immutable, so the correction is a new
version, `v1.2`, with operator publication approval and a recorded reacceptance.

## Environment

- Windows; Node v24.21.0; Next.js 16.4.3.
- Repository HEAD `aef6730`.
- Current text: `content/legal/v1.1/`; index: `docs/policies/README.md`.
- Baseline: release audit finding 4.

## Detailed Description

### Problem

`v1.1` describes recipients and data handling from before the payment-lane
change and the engagement features. A customer accepting `v1.1` today is not
told about NOWPayments as a payment recipient, email delivery for verification
and recovery, stored saves/comments/reactions, or Speed Insights measurement.
The operator's recorded decision selected NOWPayments for launch, which makes the
mismatch material rather than cosmetic.

### Expected Behavior

A new immutable version naming the actual recipients, the engagement data stored,
the measurement service, and the retention position, published only with operator
approval. Existing acceptances remain attached to the version accepted; new
acceptances record `v1.2`.

### Root Cause

Policy text is versioned correctly but publication is manual, and no check ties a
new data recipient or feature to a policy-version decision.

### Evidence

```text
content/legal/v1.1/            current published text
docs/policies/README.md        v1.1 current, v1 superseded
release audit finding 4        recipients and engagement data absent
internal follow-up 045-LIVE    published v1.1 does not name the email recipient
```

## Impact Assessment

### Affected Components

- `content/legal/v1.1/` (unchanged, historical), new `content/legal/v1.2/`.
- `docs/policies/README.md` and the policy acceptance record.
- Account signup and reacceptance surfaces.

### Risk Level

- [x] High: serving a payment lane under text that does not disclose its
  recipient is a compliance defect, not a copy edit.

## Proposed Solution

1. Inventory the actual recipients and data: Stripe, NOWPayments, Resend (or the
   selected email transport), Neon, Vercel and Speed Insights, and upstream
   model providers. Name each category and purpose; do not invent a vendor.
2. Draft `v1.2` as new immutable files. Do not edit `v1.1`; leave it readable
   as the superseded version.
3. Bump the acceptance version so a new acceptance records `v1.2`; existing
   rows keep `v1.1`. Add a reacceptance prompt only for customers who must
   accept the new text, and record it in `policy_acceptances`.
4. Obtain operator publication approval with a date, then update the policy
   index and the current-docs links. Legal review is the operator's decision and
   is not claimed by this record.

### Verification

RED: the current text does not name NOWPayments, email delivery, engagement data
or Speed Insights; no `v1.2` exists. GREEN: `v1.2` names each actual recipient
and data class, the index lists it as current, a new acceptance records `v1.2`,
and `v1.1` is unchanged. Publication requires the operator's explicit approval,
which is an external gate.

### YAGNI

No new legal entity, no new service, no rewrite of historical versions. Only the
text that the current product actually needs.

## Verification Gates

- gate: test tests/customer-policy.test.mjs
- gate: lint, typecheck, build.
- gate: test_http — `npm run test:http`.
- gate: attribution — `npm run attribution`.

**External gate:** operator approval of the published text and date. This record
cannot satisfy it, and automation level 1 means publication is never automatic.

### Verification Receipt

- verified: not yet — design converged; text and approval pending.

## Perfection Loop

### Loop 1 — RED

- **RED:** v1.1 is the served text while the product has new recipients and data.
- **GREEN:** new immutable v1.2 with acceptance versioning.
- **AUDIT:** the policy index names v1.1 current; the payment decision selected
  NOWPayments; the email and engagement features exist.
- **ADVERSARIAL:** naming a recipient that is not actually used is also a false
  statement. The inventory must be verified against configuration, not intent.
- **CHANGE DELTA:** initial design.

### Missed Questions

1. **Can v1.1 be edited in place?** No. Published text is immutable; a correction
   is a new version.
2. **Must every customer reaccept?** Only where the operator and counsel decide
   the change is material; the mechanism records the version either way.
3. **Is Speed Insights a data recipient?** It receives measurement data, so it
   belongs in the disclosure if it remains enabled.
4. **Does this authorize launch?** No. Publication is one prerequisite among the
   FID-2026-1103-127 observations.

### Loop 2 — Independent audit and self-correction

- **RED:** a new version could be published without updating the index or the
  acceptance version.
- **GREEN:** publication includes the index update and one real acceptance test.
- **AUDIT:** `policy_acceptances` already stores a version; the signup surface
  reads the current version from the policy module.
- **ADVERSARIAL:** cached text could serve v1.1 after publication. The policy
  read path and cache headers must be checked in the HTTP receipt.
- **CHANGE DELTA:** 5%.

### Loop 3 — Final convergence

- **RED:** the text could promise deletion or retention the code does not perform.
- **GREEN:** every claim maps to an implemented behavior or is stated as a
  limitation.
- **AUDIT:** no retention job exists; the text must not claim automatic deletion.
- **ADVERSARIAL:** operator approval can be given verbally; the recorded date and
  version are the evidence, not the conversation.
- **CHANGE DELTA:** 0%; converged before code.

## Implementation Evidence

Pending. Text drafting and publication are operator-gated.

- [ ] Commit SHA, file ranges, gate output, step statuses.
- [ ] Published version and date.
- [ ] One recorded `v1.2` acceptance.

## Code Verification Evidence

- [x] Current policy files, index and acceptance storage were inspected.
- [x] Status reflects reality: `converged`, not published.

## Resolution

- **Convergence Date:** 2026-11-04 17:10
- **Next action:** operator approves the recipient inventory; worker drafts
  `v1.2` and the acceptance bump; operator publishes with a date.
- **Archived:** no.

## Lessons Learned

Policy versioning only works when a new data recipient triggers a version
decision. Otherwise the text stays technically versioned and factually stale.
