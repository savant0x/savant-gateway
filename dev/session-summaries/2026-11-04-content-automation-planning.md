# Content automation and persistent matching — planning receipt

Date: 2026-11-04, America/New_York. Grounding HEAD: `f6d2a5b`.
Scope: SCOPE CA1–CA5. Strict single-agent ECHO, autonomy 3 for planning.

Operator boundary, verbatim: "This is big enough for a multi fid + perfection
loop only. You are the planning agent, not the coding".
Persistence requirement, verbatim: "The entire point of tagging it is so the
link is persistant".

No application code, schema, runtime setting, publisher fetch, hosted scheduler,
credential, deployment or paid service changed. The two existing untracked
chat exports remain untouched. No FID is closed or archived by this pass.

## Deliverables and handoff

| Record | Status | Coding-session responsibility |
| --- | --- | --- |
| [015](../fids/FID-2026-1104-015-content-fetch-automation-and-history.md) | converged, design only | Fixed authenticated heartbeat, dashboard policy, bounded/resumable fetching, durable source/run history and honest health |
| [016](../fids/FID-2026-1104-016-persistent-content-model-decisions.md) | converged, design only | Durable acceptance/dismissal/restore, atomic reconciliation, legacy migration and consistent public visibility |
| [017](../fids/FID-2026-1104-017-content-matching-controls-and-review.md) | converged, design only | Complete link inventory, matching policy/aliases, stored-content rematch and durable catalog invalidation |
| [018](../fids/FID-2026-1104-018-content-automation-master.md) | converged, design only | Implementation order, ownership, integrated acceptance and external activation boundaries |

Implement 015, then 016, then 017. The master owns integrated evidence. The
operator reserved coding to a later session. Scheduler backend/tier remains
unconfirmed; activation additionally needs secret provisioning and deployment
permission. These are explicit inputs, not inferred consent or a design gap.

Accepted links remain on the stored content and exact eligible model across
refetch/rematch/restart. They remain in accepted/all-active inventory after
leaving the suggestion queue. Dismissal removes the association from active and
public use while retaining an internal suppression decision. It never deletes
the story. Topic metadata and model associations remain separate concepts.

New detections default to review-required; automatic publication is a dashboard
option. Existing machine-published links migrate honestly as automatic, with no
fabricated human acceptance. All public projections must share visibility and
catalog eligibility. Unavailable accepted models remain inspectable in admin.

## Ground-truth findings

- The cron route is POST-only, reads a content-specific secret and has no
  repository scheduler artifact. Vercel cron uses GET and `CRON_SECRET`.
  This is repository evidence; live external scheduling was not inspected.
- Fetch cycles are already durable, but the dashboard reads only eight.
- The model-link table shows only 15 recently created pairs, without full paging.
- Matching runs for each returned item on every source fetch. It uses normalized
  title-token aliases or exact tags, not a semantic body classifier.
- There is no matching policy/settings surface, catalog-change trigger or
  stored-archive rematch job.
- Automatic matches mark themselves reviewed; there is no explicit Accept action.
- Dismiss deletes a link, which a later fetch recreates.
- Empty matching results do not retire old automatic associations.
- Item detail reads unreviewed links that model coverage excludes.
- A suffixed sibling title also matches the shorter model alias.
- The source attempt timestamp advances on failures; it is not last success.
- Claims and deadline machinery exist, but due selection precedes the claim and
  the run deadline is checked only before starting each source.

Official Vercel docs were fetched through Context7 `/websites/vercel`: GET/Bearer
authentication, Hobby daily-only scheduling, Pro/Enterprise minute-level minimum.
No tier upgrade, scheduler registration or external app action was performed.

## Reproducible in-memory experiment

The following analysis runs actual production stores against a disposable
in-memory PGlite database, without publisher access or project-file writes:

```js
// Run with node --input-type=module from the repository root.
import { createStorageDatabase } from "./lib/storage/database.ts";
import { createSource } from "./lib/content/store/sources.ts";
import { upsertItem } from "./lib/content/store/item-writes.ts";
import {
  replaceAutoLinks, dismissAutoLink, listLinksForItem, listContentForModel,
} from "./lib/content/store/links.ts";
import { suggestModelLinks } from "./lib/content/linking.ts";

const db = await createStorageDatabase({ env: {} });
try {
  const source = await createSource(db, {
    kind: "rss", label: "Planning fixture", url: "https://example.test/feed",
    config: { tags: [] }, enabled: true, fetchIntervalMinutes: 60, maxItems: 5,
  });
  const itemId = await upsertItem(db, source, {
    kind: "article", title: "GPT-6 Luna release", url: "https://example.test/item",
    excerpt: "", bodyHtml: null, author: null,
    publishedAt: "2026-11-04T12:00:00.000Z", thumbnailUrl: null,
    videoId: null, externalId: null, tags: [],
  });
  const model = {
    id: "gpt-6-luna", name: "GPT-6 Luna", family: "GPT", upstreamId: "gpt-6-luna",
  };
  const suggestions = suggestModelLinks(
    { title: "GPT-6 Luna release", kind: "article", tags: [] }, [model],
  );
  await replaceAutoLinks(db, itemId, suggestions);
  console.log("auto_marks_itself_reviewed=" + suggestions[0].reviewed);
  await dismissAutoLink(db, itemId, model.id);
  console.log("after_dismiss=" + (await listLinksForItem(db, itemId)).length);
  await replaceAutoLinks(db, itemId, suggestions);
  console.log("after_refetch=" + (await listLinksForItem(db, itemId)).length);
  await replaceAutoLinks(db, itemId, []);
  console.log("after_empty_reconcile=" + (await listLinksForItem(db, itemId)).length);
  await replaceAutoLinks(db, itemId, suggestions.map(s => ({ ...s, reviewed: false })));
  console.log("unreviewed_item_links=" + (await listLinksForItem(db, itemId)).length
    + " coverage=" + (await listContentForModel(db, model.id)).total);
  const sibling = {
    id: "gpt-6-luna-fast", name: "GPT-6 Luna Fast", family: "GPT",
    upstreamId: "gpt-6-luna-fast",
  };
  console.log("sibling_title_matches=" + JSON.stringify(suggestModelLinks(
    { title: "GPT-6 Luna Fast launch", kind: "article", tags: [] }, [model, sibling],
  ).map(s => s.modelId)));
} finally {
  await db.close();
}
```

Actual output, exit 0:

```text
auto_marks_itself_reviewed=true
after_dismiss=0
after_refetch=1
after_empty_reconcile=1
unreviewed_item_links=1 coverage=0
sibling_title_matches=["gpt-6-luna","gpt-6-luna-fast"]
```

This is a reproduction of existing defects, not verification of their repairs.

## Perfection Loop receipt

Each record contains RED, GREEN, AUDIT, ADVERSARIAL and missed-question sections.
The independent self-audit was single-agent: source/caller and runner inspection,
real store/matcher experiments, then manual adversarial document review. No
delegation occurred and no second reviewer is claimed.

Measured character Levenshtein distance divided by the prior document's character
length (UTF-16 code units, matching the JavaScript measurement):

| Pass | 015 | 016 | 017 | 018 |
| --- | --- | --- | --- | --- |
| Initial correction | 698/11528 = 6.055% | 727/11225 = 6.477% | 609/13415 = 4.540% | 657/12292 = 5.345% |
| Audit recording/corrections | 1303/12226 = 10.658% | 798/11952 = 6.677% | 820/13900 = 5.899% | 896/12949 = 6.919% |
| Projection/policy refinement | 0/13488 = 0% | 158/12713 = 1.243% | 626/14684 = 4.263% | 642/13815 = 4.647% |
| File/API ownership | 444/13488 = 3.292% | 459/12871 = 3.566% | 584/15310 = 3.815% | 0/14457 = 0% |
| Final metadata/snapshot/atomicity corrections | 228/13932 = 1.637% | 163/13330 = 1.223% | 6/15894 = 0.038% | 360/14457 = 2.490% |
| Frozen final review A | 0% | 0% | 0% | 0% |
| Frozen final review B | 0% | 0% | 0% | 0% |

**Process deviation:** the second 015 pass exceeded the 10% cap (10.658%).
It combined a source-history correction with audit-record prose. That edit was
already made when measured; it is not relabeled as compliant or erased from the
receipt. Further design changes were held while the affected contract was
re-audited; subsequent measured edits were below the cap. Two final unchanged
reviews found no further actionable design correction. Document convergence is
claimed; an entirely deviation-free process is not claimed.

Substantive audit corrections include: whole-source checkpoints and pinned
listing membership; real PostgreSQL proof registration; correct HTTP runner
placement; preserving fetch receipts on source deletion; shared public
eligibility; item/tag atomicity; model-scoped retirement; occurrence-local
longest aliases; materialized rematch membership rather than hash-id chronology;
35s/10s work budgets; matching-input revisions rather than sync timestamps; and
separate detection/publication/acceptance semantics.

Final review A manually checked those invariants and the source evidence; review
B reran the full structural/reference/test-gate check. All four final hashes
matched across both reviews, so the measured final deltas were exactly zero.
Structural results are not presented as behavioral proofs:

```text
checks: 163
errors: []
dependencyOrder: [015, 016, 017, 018]
result: PASS
```

| FID | Final characters | SHA-256 of final UTF-8 text |
| --- | --- | --- |
| 015 | 14155 | `bb987fd2255067219e4a508c1b6b61026a590444136932497a797d8e5a24d874` |
| 016 | 13488 | `03e0b778d56bcf766cf95204beda22243558c58ec7d3d1976b60d7f27ff81384` |
| 017 | 15895 | `4008b3afe73c3c29e2815f4f447e38a07b0a1cce049a597e54085ffc73f8acc5` |
| 018 | 14540 | `7a599f4c42f1b7932fc52a0528e4b018d7e6e9da29b80dad52790f51d5fed5b5` |

## Planning verification receipt

All commands ran on 2026-11-04. Only documentation changed; runtime results
describe the unchanged application baseline, not the planned features.

```text
node --test tests/content-ingest.test.mjs tests/content-linking.test.mjs tests/content-store.test.mjs tests/content-sources.test.mjs tests/content-taxonomy.test.mjs tests/catalog-skus.test.mjs tests/model-identity.test.mjs
exit 0; tests 55; pass 55; fail 0; skipped 0; duration_ms 9122.4697

npm run check
exit 0
eslint . --max-warnings=0
next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully

npm test
exit 0
tests 1019
pass 1015
fail 0
cancelled 0
skipped 4
duration_ms 81979.5333

npm run quality
exit 0
quality: PASS (400-line ceiling, 605 files scanned)

npm run build
exit 0
✓ Compiled successfully in 13.4s
Finished TypeScript in 3.0s
✓ Generating static pages using 15 workers (23/23) in 652ms
Finalizing page optimization ...

npm run config:check
exit 0
config-check: PASS (non-production)

npm run attribution
exit 0
attribution-guard: PASS (no coding-agent credit found)
attribution-document-guard: PASS (no governed credit line)

npm run repository:check
exit 0
repository-check: PASS (Node 24, 11 gates, 12 active FIDs, root links and current docs consistent)

npm run storage:check
exit 0
sqlite handle importers under app/, lib/: 0
lib/store modules with inline statements: 0
legacy statements: 0
PASS — one storage engine, resolved at lib/storage/runtime.ts

git diff --check
exit 0; no output
```

Four full-suite skips require `TEST_DATABASE_URL`; this pass did not supply a
disposable networked database. `npm run verify`, mandatory real-PostgreSQL proof,
HTTP/recovery/load gates and browser journeys were not run or claimed. The six
new behavioral/concurrency test files are future deliverables, explicitly gated
in the children/master. No proposed feature is represented as working.

## Version-control boundary

Planning documents may be committed locally with explicit paths. No main push
is performed in this planning-only pass because the project has Git-triggered
hosting and this instruction does not authorize a hosted deployment. Local
planning commit metadata is available in Git history; it is not an implementation
commit and does not close any child. No release or tag is created.
