# FID: Social metadata coverage gate

**Filename:** `FID-2026-1031-074-social-metadata-coverage-gate.md`
**ID:** FID-2026-1031-074
**Renumbered:** 2026-10-31 — formerly `FID-2026-1030-065`; the record was moved
with its card predecessors to keep the three-record sequence contiguous.
**Parent:** FID-2026-1031-072
**Severity:** medium
**Status:** closed
**Created:** 2026-10-30
**Automation level:** 3
**YAGNI-Compliance:** Verified — one parser, one check module, no crawler simulation.

## Summary

The site shipped for weeks with **no social card metadata at all** and every gate
stayed green, because nothing in CI ever read the head of a rendered page. FID-2026-1031-072
added the card (FID-2026-1031-072) and per-page cards (FID-2026-1031-073); neither would stop the same gap
returning in a new route or a metadata refactor. Add a gate that fails when a
public page emits an incomplete card or names a card image that does not serve.

## Environment

- OS: Windows (Git Bash), Node 22.18.0 with type stripping
- Next.js 16.4.3; gate runs inside `scripts/http-suite.mjs` against a disposable
  production build, so it is already part of `npm run test:http` and CI
- Commit/State: committed as `d72f6ef`

## Detailed Description

### Problem

`npm test`, `npm run quality`, `npm run build` and both HTTP suites never parsed
`<head>`. Both FID-2026-1031-072 and FID-2026-1031-073 could have been reverted, or a new public page
added without metadata, and CI would still pass.

### Expected behavior

`npm run test:http` fails with the page path and the specific problem when any
public page lacks `og:title`, `og:description`, `og:image` (absolute, with
dimensions), `twitter:card`, or when the card image it names returns a non-image.

### Root cause

Gate coverage was behavioural for APIs and visual for pages; document metadata
was asserted only by hand, and only once, while writing the FID.

## Impact Assessment

Test-only surface plus two page metadata corrections. Adds ~38 checks and roughly
one second to the suite: fifteen page requests and five image requests. No
production code path changes.

## Proposed Solution

### Approach and steps

1. `scripts/http-suite/metadata.mjs` — a pure parser (first tag wins, `property`
   or `name`, entity decoding) and `auditSocialMetadata`, so the rules can be
   tested without a server.
2. `scripts/http-suite/metadata-checks.mjs` — requests every public page, audits
   it, follows the declared `og:image` path back to the running server, and
   asserts `/models` and `/docs` no longer share the site-wide card.
3. Wire it into `scripts/http-suite.mjs` before the checks that leave the
   database unusable for page requests.
4. `tests/metadata.test.mjs` — nine cases proving the failure path, including the
   two mistakes this session actually made.

### Verification

`node --test tests/metadata.test.mjs` for the rules; `npm run test:http` for the
live pages.

## Verification Gates

- gate: `node --test tests/metadata.test.mjs`
- gate: `npm run test:http`

## Perfection Loop

- **RED:** no gate inspected `<head>`; the FID-2026-1031-072 gap had passed CI unnoticed.
- **GREEN:** parser, live checks, unit tests, suite wiring.
- **AUDIT:** ran the gate against the real build rather than assuming it would
  pass.
- **ADVERSARIAL:** this is the part that mattered. The gate's **first live run
  failed**: `metadata /models carries a social card — twitter:card is "summary"`.
  FID-2026-1031-073's `twitter: { images: [] }` override was replacing the root
  `summary_large_image` with Next's default small card, so the two busiest pages
  would have shipped a small card with **no image** — worse than before FID-2026-1031-073.
  Both pages now restate `card: "summary_large_image"` and the suite passes.
- **SELF-CORRECT:** the audit deliberately does not require `twitter:image`,
  because Twitter falls back to `og:image` and a second generated route per page
  would double the render for no visible gain.

## Resolution

- **Closed Date:** 2026-10-31
- **Commit:** `d72f6ef` — per-page cards and the metadata coverage gate.
- **Gate result:** `http-suite: 461 checks PASS` (up from 423),
  `trial-http-suite: all checks PASS`; `tests/metadata.test.mjs` 9/9.
- **Archived:** 2026-10-31

## Implementation Evidence

- `node --test tests/metadata.test.mjs` → 9 tests, 9 pass.
- `npm run check` exit 0; `npm test` exit 0.
- `npm run build` exit 0.
- `npm run test:http`: 30 metadata assertions pass across fifteen pages — `/`,
  `/models`, `/compare`, `/docs`, `/plans`, `/signup`, `/login`, `/support`,
  `/terms`, `/privacy`, `/refunds`, `/acceptable-use`, `/legal`,
  `/legal/v1/terms`, `/legal/v1.1/terms` — plus five card-image fetches, all
  `200` with an `image/*` content type, then `461 checks PASS`.
- The negative case is proven twice: by the nine unit tests, and by the gate
  failing on its first live run against a real defect.

## Remaining Gates

- Slug-level pages are covered by one representative each (`/legal/v1/terms`,
  `/legal/v1.1/terms`), not every policy slug; the four top-level policy pages
  are checked individually.
- `/account`, `/admin/*` and `/dashboard` are excluded on purpose: they are
  session-gated or `noindex`, and their cards are not a share surface.
- The gate asserts tags and image serving, not what a platform does with them. No
  crawler cache or crop behaviour is verified.

## Lessons Learned

A check written after a fix is cheap; a check written *before* the fix is what
turns it into a gate. This one paid for itself on its first run by catching a
metadata downgrade introduced by the previous change — which is the strongest
argument for asserting on rendered output rather than on source.
