# FID: Filtered Hacker News AI and agent source

**Filename:** `FID-2026-1102-110-hackernews-ai-filtered-source.md`
**ID:** FID-2026-1102-110
**Severity:** medium
**Status:** closed
**Created:** 2026-11-02 22:15
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

`resources/API-master` is the Hacker News Firebase API reference, not a runtime
package. Its public v0 API exposes ranked item-id lists and individual JSON item
records, but it has no server-side topic search. The gateway can integrate it as
an optional first-class content source by fetching a bounded candidate window and
applying a deterministic AI/agent topic filter before storage. The integration
must preserve Hacker News discussion identity separately from a linked publisher
URL, because the existing content table deduplicates on its canonical URL and the
same article can have multiple Hacker News submissions.

## Environment

- **OS:** Windows host
- **Language/Runtime:** TypeScript strict, Node.js v24.21.0 host runtime; project target Node `22.x`; Next.js 16.4.3
- **Tool Versions:** npm 12.2.1; PostgreSQL with PGlite local development
- **Commit/State:** `875152dc7e90877ecc7fbd0fd9c8139a59c7acb1`; existing working-tree edits in `package.json` and `package-lock.json` were preserved
- **Source Reviewed:** `resources/API-master/README.md`, `resources/API-master/LICENSE`

---

## Detailed Description

### Problem

1. The reviewed source directory contains only the Hacker News API README and
   MIT license. There is no client library, executable, schema, or package to
   install.
2. The API has no topic query. `/v0/topstories`, `/v0/newstories`,
   `/v0/beststories`, `/v0/askstories`, `/v0/showstories`, and
   `/v0/jobstories` return item ids; `/v0/item/<id>.json` returns the item.
3. The gateway's `SOURCE_KINDS` currently has `rss`, `youtube`, `huggingface`,
   and `trendshift` only (`lib/content/types.ts:13-20`). Its ingestion switch
   routes those kinds to XML, JSON, or HTML parsers
   (`lib/content/ingest.ts:268-310`). Registering a Hacker News JSON endpoint as
   RSS would produce an empty parse and eventually disable the source.
4. The existing content item has one canonical `url`
   (`lib/content/types.ts:77-95`), and storage upserts on that URL
   (`lib/content/store/items.ts:244-301`). Using the linked publisher URL as the
   Hacker News identity would merge separate submissions of the same article.
5. The existing reader fetches `item.url` when the stored body is insufficient
   (`lib/content/reader.ts:111-147`). A Hacker News discussion URL must not be
   scraped as if it were the publisher article.

### Expected Behavior

- An operator can register a dedicated Hacker News source without pretending it
  is RSS, and can select one or more HN ranked streams.
- The source fetches a bounded candidate window, ignores comments, polls,
  deleted items, dead items, malformed records, and unsupported item types, and
  stores only stories that pass the configured deterministic topic filter.
- The default include vocabulary covers AI, agents, LLMs, models, inference,
  training, embeddings, RAG, evaluation, GPUs, robotics, and major AI vendors;
  operators can add include terms and explicit exclusions.
- A title match is stronger than a body or URL match. Terms use token/phrase
  boundaries, so arbitrary substrings do not qualify a story. An exclusion wins
  over an inclusion.
- A healthy fetch with zero matching stories is represented as a successful
  empty cycle; malformed root JSON or a changed response shape fails the cycle
  and remains visible to the operator.
- Every stored HN item keeps the stable discussion URL as its canonical URL and
  may keep the story's separate external publisher URL. Detail pages expose the
  discussion and publisher links honestly; reader extraction uses the publisher
  URL only when one exists.
- HN author, source, publication time, and discussion URL are retained for
  attribution. The API README's MIT license is not treated as a license for
  user-submitted Hacker News content; launch copy and legal review must preserve
  the source link and avoid claiming ownership of the posts.
- The source remains content-only. It does not enter provider routing, model
  pricing, credit settlement, subscription entitlements, or inference admission.

### Root Cause

The content system was built around source-specific parsers but has no typed
adapter for a JSON id-list-plus-item API and no field for separating a content
item's identity URL from its publisher URL. The absence of a server-side search
means topical selection must be an explicit, bounded local policy rather than a
query parameter or an LLM call hidden in ingestion.

### Evidence

```text
resources/API-master/README.md:11-15 — v0 base URL, versioning, and no current rate limit
resources/API-master/README.md:23-45 — item fields: id, type, by, time, text, kids, url, title
resources/API-master/README.md:167-206 — maxitem, ranked story lists, and updates
resources/API-master/LICENSE:1-22 — MIT text for the reviewed source artifact
lib/content/types.ts:13-20 — current source-kind union
lib/content/ingest.ts:268-310 — current kind-specific ingestion switch
lib/content/store/items.ts:244-301 — canonical URL upsert and item persistence
lib/content/reader.ts:111-147 — reader fetches item.url on missing/short body
lib/storage/schema/content.ts:41-66 — content item schema and unique URL index
components/content/content-detail-aside.tsx:103-110 — one "Read the original" URL today
```

Live read-only probes on 2026-11-02 returned HTTP 200 from
`https://hacker-news.firebaseio.com/v0/maxitem.json`, `topstories.json`,
`newstories.json`, `updates.json`, and `item/8863.json`. The observed list
sizes were top 500, new 500, best 200, Ask 30, Show 163, and jobs 31. A recent
story record contained `type: "story"`, `by`, `time`, `title`, `url`, and `kids`;
another story had HN body text and no external URL. A HEAD request returned 405,
so the adapter must use GET and validate the response body rather than relying
on HEAD metadata.

## Impact Assessment

### Affected Components

- `lib/content/types.ts` — add the source kind, filter configuration, and the
  optional publisher URL on parsed/stored items.
- `lib/storage/schema/content.ts` and `lib/content/store/items.ts` — additive
  publisher URL column, migration, serialization, and stable HN URL upsert.
- `lib/content/hackernews.ts` — pure shape validation, candidate filtering,
  item normalization, bounded candidate selection, and safe HTML handling.
- `lib/content/ingest.ts` — route the source kind through the adapter with
  injected fetches and bounded concurrency.
- `lib/content/admin-input.ts`, source presets, and
  `components/admin/content-source-form.tsx` — expose the source and filter
  configuration without accepting arbitrary fetch behavior.
- `lib/content/reader.ts`, `app/signal/[id]/page.tsx`, and
  `components/content/content-detail-aside.tsx` — use and display the two URL
  roles honestly.
- `tests/content-sources.test.mjs`, `tests/content-ingest.test.mjs`,
  `tests/content-article.test.mjs`, and a focused HN parser test if the existing
  suites become too broad — parser, filter, storage, reader, and route behavior.
- Documentation and source attribution copy for the operator and public Signal
  surfaces.

### Risk Level

- [ ] Critical: System crash, data loss, or security vulnerability
- [ ] High: Major feature broken, no workaround
- [x] Medium: External JSON shape, N+1 item reads, false-positive filtering,
  URL-role confusion, and content-attribution mistakes can degrade the source
  without affecting inference billing.
- [ ] Low: Minor issue, cosmetic, or edge case

## Proposed Solution

### Approach

Add a dedicated `hackernews` source adapter rather than extending the RSS
parser. Keep the source registry URL inspectable, but constrain the adapter to
the public `hacker-news.firebaseio.com/v0/` host and known stream paths. A
source row selects a stream and carries a bounded topic policy. The adapter
fetches the stream id list once, deduplicates and caps candidate ids, fetches
story records with a small fixed concurrency limit, filters locally, normalizes
matching stories, and hands them to the existing `ingestSource` persistence and
model-link pipeline.

The canonical stored URL is always
`https://news.ycombinator.com/item?id=<numeric-id>`. The publisher link is a
separate optional `externalUrl`. HN body HTML is sanitized with the existing
content allowlist. If a matching story has no usable body and has an external
URL, the reader may extract the external article once; if it has neither, the
detail page shows the excerpt and discussion link without scraping HN as an
article.

The first implementation uses deterministic rules only. It does not call a
model per story, because that would make ingestion costly, slow, non-
reproducible, and difficult to explain to an operator. A later classifier would
need a separate FID and an explicit budget, model, privacy, and failure policy.

### Steps

1. **complete:** Add the `hackernews` source kind, typed filter configuration, additive
   `external_url` storage, and safe serialization.
2. **complete:** Implement the HN adapter with root-shape validation, story/dead/
   deleted filtering, token-aware include/exclude scoring, bounded candidate
   detail fetches, HTML sanitization, and stable discussion URLs.
3. **complete:** Wire admin creation, source presets, cron/manual fetch, reader URL
   selection, detail-page attribution, and the production call graph.
4. **complete:** Add parser, filter, storage, reader, and HTTP regression coverage;
   run the declared gates and record live read-only source evidence.

### Verification

The implementation must prove all of the following:

- A valid HN stream array and item records normalize into one stored item per HN
  id; repeated fetches update that item rather than duplicate it.
- The filter accepts representative AI/agent stories, rejects unrelated stories,
  honors explicit exclusions, does not match arbitrary substrings, and keeps a
  healthy zero-match cycle successful.
- Comments, polls, dead/deleted items, null items, malformed ids, unsafe HN HTML,
  invalid external URLs, and duplicate candidate ids are handled safely.
- Candidate and detail-fetch caps hold at the configured maximum, concurrency is
  bounded, and one missing item does not turn a valid source response into a
  false bulk import.
- HN discussion URLs and external publisher URLs round-trip separately; the
  reader never scrapes the HN discussion as a publisher article.
- Admin create → source row → manual fetch and cron fetch → `ingestSource` → HN
  adapter → `upsertItem` → Signal detail is reachable. A grep for the adapter
  caller and a disposable HTTP run must both show the production path.
- The source remains isolated from provider routing, pricing, settlement,
  subscriptions, and customer inference requests.

## Verification Gates

- `- gate: lint` — `npm run lint`
- `- gate: typecheck` — `npm run typecheck`
- `- gate: test tests/content-hackernews.test.mjs` — dedicated parser/filter suite
- `- gate: test tests/content-ingest.test.mjs` — ingestion and failure behavior
- `- gate: test tests/content-sources.test.mjs` — source/storage/admin contracts
- `- gate: test tests/content-article.test.mjs` — reader external-URL behavior
- `- gate: test` — `npm test`
- `- gate: quality` — `npm run quality`
- `- gate: build` — `npm run build`
- `- gate: test:http` — `npm run test:http`
- `- gate: verify` — `npm run verify`

### Design Verification Receipt

- reviewed: 2026-11-02
- API README and license: read 0-EOF
- source tree inventory: 2 files; no runtime package or executable
- live GET probes: HTTP 200 for maxitem, topstories, newstories, updates, and
  item/8863; no credentials or write requests used
- current content call graph: admin/cron fetch routes → `ingestSource` →
  `fetchSourceItems` → HN adapter → `upsertItem` → Signal detail
- application gates: not claimed for implementation; no application code was
  changed in this design-only pass

### Records-Only Gate Receipt

- `npm run attribution`: exit 0 — attribution guard PASS; document guard PASS
- `npm run verify`: exit 0 — repository check, storage contract, configuration,
  829 tests (828 pass, 1 skipped), quality PASS (531 files), production build,
  751 HTTP checks plus trial HTTP PASS, and recovery drill PASS
- `git diff --check`: exit 0
- The HTTP suite emitted `ECONNRESET` diagnostics while exercising its existing
  intentional client-disconnect probes, but the suite completed with exit 0;
  this FID does not treat those expected probe diagnostics as a source failure.

## Perfection Loop

### Loop 1 — RED

- **RED:** The reviewed API is JSON and id-list based, while the gateway only
  accepts the existing four source kinds. A generic RSS registration would fail.
  The API cannot filter AI stories, the existing item URL is the deduplication
  key, and the reader has no distinction between a discussion URL and a
  publisher URL.
- **GREEN:** Chose a dedicated adapter, local deterministic filtering, bounded
  candidate/detail fetches, stable HN discussion identity, and a separate
  publisher URL.
- **AUDIT:** The proposal maps to the current source union, ingestion switch,
  storage unique index, reader behavior, admin form, and detail link; each
  existing contract has an identified change point.
- **ADVERSARIAL:** A naive implementation could fetch every HN item, store all
  content, merge repeated external links, scrape HN as an article, trust unsafe
  HTML, or use an LLM classifier without a budget. The proposal rejects each
  path explicitly.
- **CHANGE DELTA:** Initial FID authoring; no prior FID text to compare.

### Missed Questions

1. **Can the API return only AI stories?** No. The documented API returns ranked
   ids and item records; topical filtering is local.
2. **Should the external article URL be the canonical item URL?** No. The HN
   discussion URL is the stable identity; an external URL is optional metadata.
3. **Should comments be content items?** No. The source goal is news/content
   discovery; comments are child data and would multiply reads and moderation
   obligations.
4. **Should filtering use an LLM?** No for the first implementation. A
   deterministic rule set is auditable and bounded; model classification needs a
   separate cost, latency, privacy, and fallback contract.
5. **Does the MIT license cover HN posts?** Not established by the reviewed
   artifact. Preserve attribution and source links, and require the existing
   legal/commercial review before making broader reuse claims.
6. **What happens when a valid fetch has no AI matches?** It is a successful
   empty cycle; malformed or shape-invalid upstream data is the failure case.
7. **How are duplicate submissions handled?** Each HN numeric id gets its own
   canonical discussion URL; duplicate fetches of that id upsert, while two HN
   submissions linking to one article remain distinct.

### Loop 2 — Independent audit and self-correction

- **RED:** The first design could still allow a source URL to point at an
  arbitrary public host while claiming to be Hacker News, and it did not state
  how a partially failing detail fetch is reported.
- **GREEN:** Constrain the adapter to the known HN host and stream paths; validate
  the root array before detail work; skip missing individual items while keeping
  candidate counts and failures observable; fail the cycle on malformed root
  shape or an unusable response.
- **AUDIT:** The URL policy already blocks private, loopback, link-local, and
  credential-bearing URLs (`lib/content/url.ts:29-70`), but the HN adapter still
  needs a source-specific host/path allowlist. The five-failure disable rule in
  `lib/content/store/sources.ts:254-285` remains the source health boundary.
- **ADVERSARIAL:** A public DNS name can still rebind after validation, so the
  adapter must not become a generic operator-controlled proxy. A redesign that
  changes the HN host or path must fail before any request. A list containing
  ids for deleted stories must not mark the source unhealthy.
- **CHANGE DELTA:** Documentary correction only; the design remains within the
  FID change budget.

### Loop 3 — Final convergence

- **RED:** The existing public detail aside has one link labelled “Read the
  original,” which is ambiguous for a story with both an HN discussion and a
  publisher page. The existing reader's `item.url` assumption also conflicts
  with stable HN identity.
- **GREEN:** The converged contract adds `externalUrl`, keeps the discussion URL
  canonical, gives the reader an explicit publisher target, and requires two
  labelled outbound links where both exist.
- **AUDIT:** The storage unique index and upsert contract now remain correct for
  repeated HN submissions; HTML sanitation, URL validation, source health, and
  content/billing isolation are all assigned to concrete code and test points.
  No production caller is claimed because the FID is not implemented.
- **ADVERSARIAL:** Empty matches, deleted records, malformed lists, duplicate
  ids, same-article resubmissions, HN-only Ask/Show stories, blocked publishers,
  and source redesigns each have an explicit outcome. No paywall bypass or
  attribution shortcut is introduced.
- **CHANGE DELTA:** 0% after the final audit; the record is converged for
  implementation review.

## Implementation Evidence

- [x] **Commit SHA:** implementation and this closure record are in the
  containing commit.
- [x] **File:line ranges:** `lib/content/hackernews-config.ts`,
  `lib/content/hackernews.ts`, `lib/content/types.ts`,
  `lib/content/store/sources.ts`, `lib/content/store/items.ts`,
  `lib/content/store/item-rows.ts`, `lib/content/store/links.ts`,
  `lib/content/ingest.ts`, `lib/content/reader.ts`,
  `lib/content/admin-input.ts`, `lib/content/presets.ts`,
  `lib/storage/schema/content.ts`,
  `components/admin/content-source-form.tsx`,
  `components/admin/content-source-presets.tsx`,
  `components/content/content-detail-aside.tsx`,
  `app/admin/(panel)/content/page.tsx`, and the four content test suites.
- [x] **Gate output:** `npm run verify` exit 0 — 841 tests (840 pass, 1
  skipped), quality PASS (533 files), production build 0, 750 HTTP checks plus
  trial HTTP PASS, and recovery drill PASS. Lint zero warnings and typecheck 0
  separately. Live read-only probe: topstories returned 500 unique ids; one item
  normalized to a story with its publisher URL.
- [x] **Reproducibility:** `node --test tests/content-hackernews.test.mjs`
  exercises the URL allowlist, root list validation, item normalization, unsafe
  HTML, URL policy, include/exclude filter, source persistence, ingestion,
  deduplication, empty cycle, failure cycle, and candidate bound.
- [x] **Step statuses:** all four implementation steps are complete.

## Resolution

- **Closed Date:** 2026-11-02
- **Fix Description:** Implemented the filtered Hacker News source with a
  bounded ranked-list adapter, deterministic topic filter, canonical discussion
  URL, separate publisher URL, admin stream/filter controls, preset, reader
  target selection, and two labelled outbound links.
- **Tests Added:** Yes — `tests/content-hackernews.test.mjs` plus reader and
  storage assertions in the existing content suites.
- **Verification Evidence:** `npm run verify` exit 0 and the focused suites
  recorded above; lint/typecheck 0; live read-only list and item probes.
- **Archived:** yes — `dev/fids/archive/FID-2026-1102-110-hackernews-ai-filtered-source.md`

## Lessons Learned

An API that publishes public data is not automatically a content license, and a
ranked id feed is not a search API. Preserve source identity, bound fan-out,
make filtering deterministic before introducing model calls, and keep external
content concerns isolated from the inference money path.
