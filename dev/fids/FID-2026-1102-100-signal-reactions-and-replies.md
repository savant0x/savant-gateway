# FID: Signal reactions and threaded replies

**Filename:** `FID-2026-1102-100-signal-reactions-and-replies.md`
**ID:** FID-2026-1102-100
**Severity:** medium
**Status:** converged
**Created:** 2026-11-02 19:05
**Automation level:** 2
**YAGNI-Compliance:** Pending

---

## Summary

Signal has a public, signed-in discussion and a save action, but no reactions
and no replies. The old site's engagement model included lightweight signals on
items. This FID defines the smallest honest version: one reaction per customer
per item, a bounded reaction count, and one level of replies on a comment. It
does not add notifications, moderation queues, or a reputation score.

## Environment

- **OS:** Windows, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node `>=22.18.0`, Next.js 16
- **Storage:** PostgreSQL
- **Commit/State:** `cb0633b` plus the content working tree
- **New dependencies:** none expected

## Detailed Description

### Problem

A reader can save an item and post a top-level comment, but cannot signal
agreement or answer another comment. The discussion is therefore flatter than
the old site and provides no lightweight engagement signal for the operator.

### Expected Behavior

- A signed-in customer can add or remove one reaction (`useful`, `insightful`)
  per item.
- Counts are aggregate and public; the customer's own selection is visible.
- A signed-out visitor sees counts and a sign-in prompt.
- A comment can have at most one level of replies; a reply cannot be replied to.
- Comment and reply bodies use the same length and rate limits.
- Deleting a parent comment deletes its replies.
- No email, push, or in-app notification is claimed.

### Root Cause

Not a defect. The retention slice deliberately shipped saves, watches, and
top-level comments only.

### Evidence

```text
lib/storage/schema/content.ts: content.comments has no parent_id
lib/content/store/comments.ts: top-level list only
components/content/comment-section.tsx: flat list
```

## Impact Assessment

### Affected Components

- `lib/storage/schema/content.ts` (reactions table, `comments.parent_id`)
- `lib/content/store/engagement.ts` or a new reactions store
- `lib/content/store/comments.ts`
- `app/api/content/[id]/reactions/route.ts` (new)
- `app/api/content/[id]/comments/route.ts`
- `components/content/reaction-bar.tsx` (new)
- `components/content/comment-section.tsx`
- `app/signal/[id]/page.tsx`
- tests for the pure limits and the store

### Risk Level

- [ ] Critical
- [ ] High
- [x] Medium: a public write path needs auth, rate limiting, and idempotency
- [ ] Low

## Proposed Solution

### Approach

Add `content.reactions` with a composite primary key `(user_id, item_id,
reaction)`. A toggle is an insert/delete, so a retry cannot duplicate. Add a
nullable `parent_id` to comments with an FK to the same table; the API rejects a
parent that is itself a reply. Reuse the existing comment rate limit and body
cap. Render replies indented by one level.

### Steps

1. Define the migration additively and keep existing comments valid.
2. Add the reaction store and toggle API with `guardCustomer`.
3. Add the reply column, validation, and depth rule.
4. Render the reaction bar and one-level reply list/form.
5. Add store and pure-validation tests.

### Verification

Planned tests: reaction toggle is idempotent per user, a second user increments
the aggregate, a reply to a reply is rejected, a parent delete cascades, and the
existing comment rate limit still applies.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/content-reactions.test.mjs
- gate: test tests/content-comments.test.mjs
- gate: quality
- gate: build

### Verification Receipt

Not run. Status is `converged`; implementation has not started.

## Perfection Loop

### Loop 1 — RED

- **RED:** No reaction table, no reply column, no API or UI.
- **GREEN:** Not started.
- **AUDIT:** Evidence above confirms the absence.
- **ADVERSARIAL:** Reactions are a public write path and can be used to spam.
  The design must cap distinct reactions per user/item and reuse the comment
  rate limiter; a per-item count alone is not enough.
- **CHANGE DELTA:** New FID.

### Missed Questions

1. Are reactions a purchase signal? → No. They are content engagement and must
   never enter pricing, holds, or settlement.
2. Should counts be denormalized? → No. The corpus is small; aggregate with
   `GROUP BY` and add an index if measured.
3. Should replies notify the parent author? → Not in this slice. Notification
   delivery is a separate service and would be an unverified claim.
4. Should anonymous reactions be allowed? → No. One customer, one reaction is
   the only rule that can be enforced with the existing auth.

### Implementation Evidence

Not applicable; status is `converged`.

### Code Verification Evidence

- [ ] Files referenced in Affected Components exist
- [ ] Implementation matches the Proposed Solution
- [ ] Typecheck/tests/lint pass with pasted tool output
- [ ] Production call-graph evidence is present
- [ ] FID status reflects the implementation state

## Resolution

- **Closed Date:** not closed
- **Fix Description:** Planned; no code shipped under this FID.
- **Tests Added:** No.
- **Verification Evidence:** None.
- **Archived:** not archived.

## Lessons Learned

Engagement features look small and are not: every public write path needs an
auth check, a rate limit, an idempotency key, and a cascade rule. Scope one
level of replies rather than a tree.
