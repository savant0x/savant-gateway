# QC pass — customer documentation and discoverability

Date: 2026-10-31. Scope: the public documentation surface, the path from signup
to a first request, FAQ coverage, docs discoverability, search metadata, and the
claims those pages make against implemented behavior. This is not a runtime,
financial or accessibility audit; the systems review and launch FIDs own those
boundaries.

No new FID was allocated. This is a follow-up under FID-2026-1030-056
(customer experience and API docs). The implementation is recorded in
`CHANGELOG.md`; this receipt records what was examined and what remains.

## Findings

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | The API reference was complete for someone who already knew the vocabulary, but there was no customer-facing path from account creation to a first request, and no SDK streaming example. | Added `/docs/start`: account and key, billing group, first request, first bill, failure table and next steps, plus an explicit shell setup and a JavaScript streaming example. |
| 2 | Medium | Recurring access, billing, limit, privacy and support questions had no public home, so the API reference had to answer questions it was not organized for. | Added `/docs/faq`: 33 answers in five groups, each linked to the relevant contract or account surface, including key rotation, prompt/output retention, top-up bounds and unsupported endpoints. |
| 3 | Medium | Adding two public pages without adding them to the metadata gate would have left their social cards unverified; the page list was explicit. | Extended `scripts/http-suite/metadata-checks.mjs` with both pages and their own-card requirement, and extended the public-page render/accessibility matrix. |
| 4 | Low | Discoverability was inconsistent: the main nav named only "API reference", the footer named only "Documentation", and the account and support surfaces had no FAQ path. | Added Docs/FAQ to the main nav, FAQ to the footer, newcomer/API/FAQ links to the account header, and a FAQ action on support. |
| 5 | Low | The landing quick start hardcoded `free/gpt-6-luna`, a seeded id that need not exist in a real synced catalog. | Replaced it with `YOUR_MODEL_ID` and linked to the newcomer guide. |
| 6 | Low | The newcomer guide used `GATEWAY_URL` without saying what it is for a local checkout. | It now names `http://localhost:3000` and distinguishes a hosted origin. |
| 7 | Low | The account header nav had grown from three links to five without wrapping, which risks horizontal overflow at narrow widths. | The nav now wraps with `gap-x`/`gap-y` spacing. |
| 8 | Medium | The FAQ said there was no contact address while the privacy notice prints one, and implied capability flags are enforced when the gateway forwards the payload and lets the upstream decide. | The email answer now distinguishes the authenticated support queue from the policy contact address; the tools/vision answer states the forwarding behavior. |
| 9 | Low | README's current receipt was the earlier 466-check run, and its social-card note named only `/models` and `/docs`. | Updated to the current receipt and named all four generated cards. |
| 10 | Low | `docs/README.md` did not identify which documentation is customer-facing or where its source lives. | Added a customer-facing table and linked the three page sources. |
| 11 | Low | The site had no sitemap or robots policy, and the FAQ carried no FAQPage markup, so crawlers had no canonical map and the answers were not exposed as structured data. | Added `/sitemap.xml` for 13 canonical public pages, `/robots.txt` with private surfaces excluded and a sitemap pointer, and FAQPage JSON-LD generated from the same `FAQ_GROUPS` data the page renders. The HTTP gate verifies all three. |
| 12 | Medium | The sitemap and robots routes were prerendered at build time, while the canonical origin is a runtime Fly environment value. An image built without `NEXT_PUBLIC_SITE_URL` would publish `localhost` URLs, and the FAQ schema embedded the same build-time origin. | Both metadata routes now force dynamic rendering, so they read the origin from the serving process. The FAQPage markup omits an absolute URL instead of baking one in. A production-mode probe with a disposable database and `NEXT_PUBLIC_SITE_URL=https://runtime.example` returned that origin in the sitemap and robots pointer and `200` for all four routes. |
| 13 | Medium | The docs pages are static, so their `og:image` and `twitter:image` tags were resolved during `next build`. The Dockerfile had no build argument, so an image built without the origin would ship `localhost` social metadata even though the sitemap and robots routes were runtime-correct. | The Docker build stage now accepts `NEXT_PUBLIC_SITE_URL` and exports it for `next build`; `fly.toml` supplies it under `[build.args]` alongside `[env]`, and the runbook requires the two values to match. A build with `NEXT_PUBLIC_SITE_URL=https://runtime.example` produced that origin in both docs pages' social image tags; the earlier build, without a public origin, produced `http://localhost:3000`. |

## Verification

Run from the working tree:

```text
npx prettier --check components/docs/faq-data.ts app/support/page.tsx \
  components/docs/newcomer-guide.tsx components/account/account-header.tsx
  All matched files use Prettier code style.

npm run verify
  config-check: PASS (non-production)
  tests 326, pass 326, fail 0
  quality: PASS (400-line ceiling, 307 files scanned)
  production build exit 0
  /docs/start and /docs/faq are static; both opengraph-image routes are static
  /sitemap.xml and /robots.txt are dynamic; FAQPage JSON-LD is in the FAQ page
  http-suite: 496 checks PASS (466 before; 484 after the docs-page pass)
  trial-http-suite: all checks PASS
  recovery-drill: PASS (8 concurrent writes, 1994ms)

flyctl config validate
  valid

NEXT_PUBLIC_SITE_URL=https://runtime.example npm run build
  exit 0; static docs social tags use that origin
```

The docs-page pass added 18 HTTP checks: the two pages in the public-page
matrix (render, language, skip link, one `h1`) and the two pages plus two cards
in the metadata audit. This discoverability follow-up adds 12: five for the
sitemap, four for robots and three for the FAQ schema. The API-reference checks
that reject unimplemented Messages and Responses claims still pass. A
dev-server `GET /docs/start` also returned `200`; the
rendered HTML contained the literal `baseURL` value using
`${process.env.GATEWAY_URL}/v1`, the shell setup and the `npm install openai`
note, so the code sample is not mangled by the TSX template string.

A production-mode `next start` probe used a disposable absolute database and a
synthetic `https://runtime.example` origin. Its sitemap locs and robots
`Sitemap:` line used that origin, and `/docs/start`, `/docs/faq`,
`/sitemap.xml` and `/robots.txt` all returned `200`; the FAQ HTML carried the
`FAQPage` marker. This is the evidence that the canonical origin is read at
request time rather than captured by the build.

A separate build with `NEXT_PUBLIC_SITE_URL=https://runtime.example` emitted
that origin in both static docs pages' `og:image` and `twitter:image` tags. The
earlier build without a public origin emitted `http://localhost:3000`, which is
the failure mode the new Docker build argument prevents. The Dockerfile now
refuses to build without the argument.

## Residual gaps

- No visual browser receipt was recorded for the new pages at 390/1440 widths or
  in both color schemes. The HTTP gate proves response, semantics and social
  metadata, not pixel layout.
- FAQPage markup is valid and checked, but rich-result eligibility remains a
  search-engine decision. No crawler, Search Console run or ranking observation
  was performed.
- The Docker image itself remains unbuilt: Docker's Linux engine is unavailable
  on the development machine. The build-argument behavior was exercised through
  `next build` with the same environment value, not through `docker build`.
  `flyctl config validate` accepts `fly.toml`, but no Fly builder has consumed it.
- The documentation is English only, matching the service.
- No deployed origin exists, so the guide's hosted-origin example cannot be
  exercised against production. The local origin is the tested path.
- The FAQ links to policy and account surfaces; it does not replace the policy
  text, which remains the binding versioned record.
