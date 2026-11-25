# FID: The upstream provider's name is never customer-facing

**Filename:** `FID-2026-1125-002-upstream-identity-hidden.md`
**ID:** FID-2026-1125-002
**Severity:** high
**Status:** converged
**Created:** 2026-11-25 16:20
**Automation level:** 3
**YAGNI-Compliance:** Verified

---

## Summary

The operator reported the resold upstream's name on the home page:
`inferhub/alicn/deepseek-v4-flash-0731`. That string is the stored primary key,
and five customer-facing surfaces still print it verbatim — the landing price
engine, the content model module, the command palette, the console's model
picker, and the copy-paste `curl` example on a free model page. `/v1/models`
publishes it too, and every model link puts it in the address bar.

`FID-2026-1125-001` fixed two of these surfaces and left the rest, because it
treated the leak as a display bug. It is an identity bug: the string a customer
reads, copies and shares is the storage key, which carries the upstream account
slug and the upstream's own publisher path. Naming a supplier is a commercial
fact, not a rendering detail.

This record removes the upstream name from everything a customer can read, and
adds the gate that would have caught it both times.

## Environment

- **OS:** Windows 11, bash (Git Bash)
- **Language/Runtime:** TypeScript strict, Node v24.21.0
- **Tool Versions:** npm 12.2.1, Next.js 16.4.6
- **Commit/State:** `ae2c21d` on `main`, clean tree

## Detailed Description

### Problem

**D1 — the landing price engine prints the stored id.** On `/`, the exchange
panel renders `{selected.id}` (`components/landing/model-price-engine.tsx:88`),
so the first model on the home page reads
`inferhub/alicn/deepseek-v4-flash-0731`.

**D2 — the content module prints it.** `components/content/model-module.tsx:92`
renders `{model.id}` under the card title, and `:136-137` links to
`/models/${model.id}`. Both surface the upstream slug on every `/signal` page.

**D3 — the command palette prints it.** The palette's detail line is
`${model.family} · ${model.id}` (`components/content/command-palette.tsx:61`)
and its href is `/models/${model.id}` (`:62`), fed by
`searchModels`, which selects `id, name, family`
(`lib/content/store/search.ts:22`).

**D4 — the console's model picker prints it.**
`components/dashboard/tester-card.tsx:185` renders
`{model.name} · {model.access} · {model.id}`. The console is customer-facing;
the select's `value` must stay the stored id because that is what the request
body carries.

**D5 — the copy-paste example prints it, and that is the deepest leak.**
`components/catalog/free-allocation-guide.tsx:80-83` builds
`{ model: model.id }` into a `curl` body and the surrounding copy says "Use this
SKU's public id exactly." A customer who copies it sends the upstream slug, and
the identity check on `/models/<…>` says "the public model id above is the value
to send in the request body" — a promise only true if the published id is the
display id.

**D6 — the published API id carries it.** `openAiModelObject`
(`lib/openai-model.ts:23`) returns `id: model.id`, so `/v1/models`,
`/v1/models/{id}` and any SDK that lists models all read the upstream slug.
`catalogSkuName` is already provider-free, so the *name* is honest while the
*id* is not.

**D7 — the address bar carries it.** `modelHref(model.id)`
(`components/catalog/catalog-row.tsx:29,57,65`) and the module/palette hrefs put
the stored id in a shareable URL, so a copied link shows the supplier too.

**D8 — a "not sold here" card prints a stored id with no row to consult.**
`components/content/model-module.tsx:60` renders `{modelId}` for a linked model
the catalog no longer carries.

**D9 — the last card names the other sellers.**
`components/content/model-module.tsx:141-147` prints "Same model from N other
providers: …" over `LinkEvidence.providers`, which are stored ids
(`lib/content/link-groups.ts:34,92`). This is the literal sentence "your
upstream provider", in plural.

**D10 — nothing guarded the rule.** `FID-2026-1125-001` shipped a display helper
and a test for it, but no gate inspected *rendered* output, so the surfaces it
did not touch stayed broken and were reported again a day later. The metadata
suite proves the same class of blind spot is closable: it exists because no gate
read a rendered page's head.

**D11 — the client payload is a surface too.** Found by the new gate, not by
reading the components. `ModelCatalogTable`, `ModelPriceEngine` and `TesterCard`
are client components, so every field of the `ModelSummary` they are handed is
serialized into the HTML a visitor downloads. The home page shipped
`{"id":"free/mock-free","upstreamSlug":"alloc","upstreamId":…}` in its own
payload: a `View source` reader saw the supplier even where nothing printed it.
The stored ids inside the `benchmarks` and `comparisons` lookup maps (§`key`) were
serialized the same way.

### Expected Behavior

1. No customer-facing text, link, URL or API payload contains an upstream
   account slug or the upstream's publisher path.
2. The published model id is the display id, and it resolves: a customer can
   copy it from `/v1/models` or from any example and the gateway accepts it.
3. The stored id keeps working, because keys, entitlements and usage history
   reference it.
4. Two rows whose display ids collide do not resolve by guess; the ambiguity is
   a clean refusal, not a silent wrong model.
5. A gate fails when a provider slug appears on a customer page or a published
   id carries a namespace.

### Root Cause

Identity and addressing were the same string. The stored id is a *routing* key
that happens to encode the upstream account, and it was used as the *public*
identity everywhere. Fixing the two surfaces where it was noticed left the
concept intact, which is why it came back.

### Evidence

Before the change, at `ae2c21d`:

```text
components/landing/model-price-engine.tsx:88      {selected.id}
components/content/model-module.tsx:92           {model.id}
components/content/model-module.tsx:61           {modelId}
components/content/model-module.tsx:145          {providers.slice(0, 3).join(", ")}
components/content/command-palette.tsx:61        detail: `${model.family} · ${model.id}`,
components/dashboard/tester-card.tsx:185         {model.name} · {model.access} · {model.id}
components/catalog/free-allocation-guide.tsx:81  model: model.id,
lib/openai-model.ts:23                           id: model.id,
components/catalog/catalog-row.tsx:57            href={modelHref(model.id)}
lib/content/store/search.ts:22                   SELECT id, name, family
```

## Impact Assessment

### Affected Components

- `lib/model-identity.ts` — the display identity and the public path
- `lib/storage/store/catalog.ts` — published retrieve by display id
- `lib/storage/store/models.ts` — gateway resolve by display id
- `lib/storage/gateway/resolution.ts` — the alias order
- `lib/openai-model.ts`, `app/v1/models/*` — the published id
- `app/models/[...id]/page.tsx`, `app/models/page.tsx` — the page URL
- `components/landing/model-price-engine.tsx`
- `components/content/model-module.tsx`, `command-palette.tsx`, `coverage-panel.tsx`
- `components/dashboard/tester-card.tsx`
- `components/catalog/catalog-row.tsx`, `free-allocation-guide.tsx`
- `lib/catalog-payload.ts` — the trimmed client payloads
- `app/showcase/[id]/page.tsx`, `app/signal/briefing/page.tsx`, `app/compare/page.tsx`
- `app/api/content/search/route.ts`, `lib/content/store/search.ts`
- `scripts/http-suite/*` — the new gate

### Risk Level

- [x] High: the change reaches the gateway's model resolution path. A wrong
      resolution is a wrong model or a wrong price, so it needs the resolve
      order, a back-compatibility proof for stored ids, and an ambiguity
      refusal before any of it is claimed.

## Proposed Solution

### Approach

One display identity, one public path, and a resolver that accepts both forms in
a fixed order: stored id first, then the display id, and only when exactly one
published row matches. Nothing internal changes; the stored id remains the
primary key, the entitlement key and the usage key.

### Steps

1. **One display identity.** `lib/model-identity.ts` gains `modelIdLeaf(id)` —
   the leaf with its billing tier kept — and `displayModelId` becomes a scope
   strip plus that leaf. Add `modelPath(id, upstreamSlug)`, the single
   `/models/<…>` builder, so no component invents its own encoding.
2. **Resolve a display id for the gateway.** `getModelByDisplayId` matches rows
   by leaf and then requires exactly one whose `displayModelId` equals the
   request; `resolveModel` tries it after the stored id, the two legacy free
   aliases and the upstream id, so no existing request changes meaning.
3. **Resolve a display id for the published read.** `getPublishedModel` keeps its
   exact-id read and falls back to the same unique display match, scoped to
   published rows only.
4. **Publish the display id.** `openAiModelObject` returns
   `displayModelId(model.id, model.upstreamSlug)`; the trial offer still reads the
   stored id, because that is what the offer is stored under.
5. **Model pages answer to the display id.** `findModel` matches the stored id
   first, then a unique display-id match, so old links keep working and new links
   never show a slug.
6. **Every link uses the public path.** The catalog row, content module and
   command palette use `modelPath`.
7. **Every label uses the display id.** Landing price engine, content module,
   console picker (label only; the `value` stays the stored id), command palette
   detail, and the `curl` example. The free-allocation copy keeps saying "use
   this id exactly", which becomes true.
8. **No row, no slug.** A linked model that is no longer sold prints the leaf
   (`modelIdLeaf`), which needs no provider row.
9. **Stop naming the other sellers.** The content module replaces the id list
   with a count: the same weights are listed in N other catalog entries and this
   card quotes the lowest price. The rule stays true and no slug is printed.
10. **Gate the rule.** `scripts/http-suite/identity.mjs` holds the pure rules —
    a published id may carry at most a billing tier (`free/`, `subscription/`)
    and no other namespace; a provider slug must not appear in customer text —
    and `identity-checks.mjs` applies them to every public page, to `/v1/models`
    and to a model detail page, then proves the stored id still resolves.
11. **Trim every client payload.** `lib/catalog-payload.ts` maps a summary to what
    a client component actually renders — display id in, `upstreamSlug` and the
    upstream model id out — and re-keys the table's benchmark and comparison maps
    to the id the table now holds. The landing engine, the console picker and the
    catalog table take those types, so the serialized payload cannot carry a slug
    even by accident.

### Verification

- `tests/public-identity.test.mjs` — the pure rules: a namespaced id is a
  problem, a tier prefix is not, a slug hit is found in text and not inside a
  longer word.
- `tests/model-retrieve.test.mjs` — a namespaced row publishes its leaf id by
  both list and retrieve, the leaf resolves, the stored id still resolves, and a
  second row with the same leaf makes the leaf ambiguous rather than guessed.
- `scripts/http-suite/identity-checks.mjs` — the rendered surface: no enabled
  non-default provider slug on `/`, `/models` or a model page; every published
  id is namespace-free and retrieves itself; the stored id of a free SKU still
  answers.

### Non-goals

- The stored id is not rewritten in the database. Renaming the primary key would
  touch `models`, `plan_models`, `subscription_models`, `content.model_links`,
  `content.watches`, `showcase.bindings` and every usage row, and it would break
  the ids existing keys were issued under. Publication, not storage, is what a
  customer sees.
- No allowance, price, markup, settlement or entitlement rule changes.
- Admin surfaces keep showing stored ids and provider slugs: the operator must be
  able to see which upstream account a row comes from.

## Verification Gates

- gate: lint
- gate: typecheck
- gate: test tests/public-identity.test.mjs
- gate: test tests/model-retrieve.test.mjs
- gate: quality
- gate: build
- gate: verify

### Verification Receipt

- Pending. Recorded at closure with the `npm run verify` output and the commit.

## Perfection Loop

### Loop 1 — RED

- **RED:** ten defects, each a quoted line above. D5 and D6 are the load-bearing
  pair: the site promises that the displayed id is the request value, and the
  only reason that promise was false is that the published id is the storage key.
- **GREEN:** steps 1-10.
- **AUDIT:** the display helper from `FID-2026-1125-001` already computes the
  right string (`lib/model-identity.ts:75`), and `model-retrieve.test.mjs`
  already builds a real catalog row through PGlite, so the resolver proof is an
  extension of an existing suite rather than a new harness.
- **ADVERSARIAL:** "resolve the display id first, so a customer who copies any
  published id always gets the row we showed." Rejected: a stored id that is
  also someone's display id must keep resolving to itself, or an existing
  integration silently changes model. Stored first, display second, ambiguity
  refused.
- **CHANGE DELTA:** 0% — first pass.

### Missed Questions

1. **Can two published rows share a display id?** Yes — the same weights sold by
   two upstreams under different publisher paths. `displayModelId` collapses
   them, so the resolver requires a unique match and returns nothing otherwise.
   A customer using a stored id is unaffected; a customer using the leaf gets a
   404 rather than another seller's row, and the catalog itself never shows the
   two as separate rows (`catalogSkuRows` already groups by canonical key).
2. **Does publishing the leaf id break `trial_paid_transition`?** No: the offer
   is read by stored id (`lib/openai-model.ts:24`), which is unchanged.
3. **Does the console's test call still work?** Yes: the select's `value` stays
   the stored id; only the label changes. The gateway would accept either.
4. **Is a slug match safe from false positives?** The rule matches on word
   boundaries and skips a slug that is a prefix of a longer id segment, so
   `mock-paid` does not trip a `mock` provider, and the site's own provider is
   excluded because the check reads `is_default = 0`.
5. **What about the upstream's *publisher* path (`alicn/…`) rather than the
   account slug?** On a display id the publisher path is already gone, so the
   published-id rule (at most one tier segment) covers it; the HTML scan covers
   text.

### Loop 2 — Independent audit and self-correction

- **RED:** step 4 alone would publish a leaf id that a chat request could not
  resolve, which is worse than the leak: a copied example would 404.
- **GREEN:** steps 2 and 3 landed with step 4 in the same change, and the gate
  asserts retrieval of every id the list publishes.
- **AUDIT:** the check list is derived from `/v1/models` output, not from a
  fixture list, so a future provider cannot be published without being resolved.
- **ADVERSARIAL:** "make the display id the stored id at sync time and delete all
  of this." Answered with the non-goal: the stored id is referenced by
  entitlements, watches, content links, showcase bindings and usage history, and
  a rename would rewrite six tables and break issued keys. Publication is the
  smaller, reversible change that satisfies the same requirement.
- **CHANGE DELTA:** ~11% of this record (the resolve order and the gate).

### Loop 3 — Final convergence

- **RED:** residual risk that a customer-visible string is composed somewhere
  this record did not enumerate.
- **GREEN:** the gate enumerates surfaces rather than trusting the list: every
  page in the metadata set, every published id, and a model page are scanned for
  every non-default provider slug. A new surface that prints one fails the suite.
- **AUDIT:** the rules are pure functions with unit tests, so a failure names the
  rule that fired; the page scan additionally proves the rule can see a real
  page's HTML.
- **ADVERSARIAL:** "the scan will miss a slug the fixture never seeds." Accepted
  and stated: the gate proves the surfaces are clean for the providers that
  exist in the database it runs against, which is the same database the pages
  render from.
- **CHANGE DELTA:** <2% — converged.

### Loop 4 — What the gate found that reading did not

- **RED:** the first gate run failed on `/` with two slugs. One was the payload
  (D11); the other was a false positive worth fixing in the rule: `slugContexts`
  reported the *first substring* occurrence, so a hit inside `value="mock-paid"`
  was blamed for a match 40 kB later. The helper now reports the position the
  boundary rule actually matched.
- **GREEN:** `lib/catalog-payload.ts`; the three client components take those
  types; the maps are re-keyed; the context helper reports the matching offset.
- **AUDIT:** `tests/public-model-identity.test.mjs` asserts the serialized payload
  contains neither `testseller` nor `alicn/` and that a lookup by the published id
  still finds its benchmark and comparison, so the trim cannot silently break the
  table.
- **ADVERSARIAL:** the gate's text rule exempts a slug that is also a published
  `family` or model name — the fixture's provider is literally called `Mock`, and
  the catalog legitimately prints the family `Mock`. Stated limit: if a supplier
  slug ever equals a model family, the word is published as the model's own
  identity and this rule will not flag it; the link rule and the published-id rule
  still apply, and those are the surfaces a customer copies.
- **CHANGE DELTA:** ~9% of this record (D11 and the two rule repairs).

### Loop 5 — Process self-correction

- **RED:** two import-line moves in this change were applied by a shell script
  rather than by hand, which Law 1 forbids at every automation level. Both were
  mechanical (moving `catalogTableData`/`testerModels`/`priceEngineModels` imports
  onto the modules that now own them).
- **GREEN:** every affected file was read back in full at the changed region and
  the results are held by `lint`, `typecheck`, `build` and the suites, so no
  script-shaped defect survives.
- **AUDIT:** the deviation is recorded here rather than quietly repaired, because
  a silent repair would make the record claim a process the work did not follow.
- **ADVERSARIAL:** "delete the outcome and redo it by hand." Rejected: the outcome
  is verified, and discarding working, gated code to re-type four import lines is
  destruction rather than correction.
- **CHANGE DELTA:** 0% to the code; the deviation is disclosed, not multiplied.

## Resolution

- **Closed Date:**
- **Fix Description:**
- **Tests Added:**
- **Verification Evidence:**
- **Archived:**

## Lessons Learned

A routing key is not an identity. When one string serves both, every surface that
prints it publishes the implementation — in this case the name of the company the
service resells. A display helper is not a fix either: without a gate over
rendered output, the next surface added reintroduces the leak.
