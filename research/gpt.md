# Savant Gateway × aggroNATION: Research, Integration, and Commerce Strategy

## Executive verdict, evidence, and leakage

**Executive verdict.** **[MEASURED]** The operator’s premise is directionally strong but the literal H1 claim—“no existing site combines AI content/news with immediate model purchase”—is **unsupported as written**. Hugging Face already combines Daily Papers, model pages, and routed inference providers under a Hugging Face account; users can invoke supported models from model pages without separately creating provider accounts. APInex also combines a gateway catalog with guides, comparisons, benchmarks, code recipes, model datasheets, and account-based API access. citeturn676399view3turn676399view0turn676399view1 The narrower opportunity is much more defensible: I found no major product that combines a **fresh, multi-source AI/developer feed; explicit content-to-model entity graph; model-specific live price/access state; independent evidence; and same-account inference commerce** as one coherent journey. OpenRouter is stronger on catalog and routing; Artificial Analysis on comparative evidence; Hugging Face on model/community/papers; LM Arena on preference evidence; none of those currently appears to implement that complete loop. citeturn650298search0turn650298search4turn650298search7

**[MEASURED]** The two codebases already contain the complementary foundations: Savant has the money path, catalog, account, keys, pricing, holds and settlement but no content or model detail route; aggroNATION has ingestion, ranking and on-site consumption but no normalized model entity. Savant still runs on SQLite, while its Postgres cutover is designed but not executed, so the content schema must follow—not precede—that cutover. fileciteturn0file0

| Hypothesis | Verdict | Evidence |
|---|---|---|
| **H1 — gap is real** | **Partly supported / literal wording unsupported** | **[MEASURED]** Hugging Face partially closes paper/model/inference; APInex partially closes content/catalog/API. The exact multi-source evidence→model graph→commerce combination still appears unoccupied. citeturn676399view3turn676399view0 |
| **H2 — one surface reduces leakage** | **Unknown** | **[MEASURED]** There is strong general commerce precedent for reducing steps, but I found no credible causal study specific to AI inference showing that colocating content and gateway checkout increases paid conversion. |
| **H3 — in-content model links create qualified intent** | **Unknown, highly testable** | **[MEASURED]** Developers clearly compare models and use multiple models, but no source establishes the incremental effect of an article-body model link on inference purchasing. citeturn347926search0turn347926search8 |
| **H4 — contextual price/access CTA converts better** | **Unknown, highly testable** | **[MEASURED]** Current gateway competitors prominently expose price, context and trial/playground actions on model surfaces, suggesting these are expected decision inputs, not proving conversion causality. citeturn650298search1turn672797search3turn672797search8 |
| **H5 — structured graph is required** | **Supported as an engineering/trust requirement** | **[MEASURED]** The current aggregator has only source types and free-form tags, while ambiguous terms such as “Claude,” “Opus” and “GPT” cannot safely identify exact purchasable versions. fileciteturn0file0 **[RECOMMENDATION]** Purchase-capable links should therefore require explicit model IDs, evidence provenance and confidence state. |

**[RECOMMENDATION]** The three strongest opportunities are: first, build `/models/[id]` into the canonical bridge between evidence and commerce; second, make the content-to-model graph a proprietary operational asset rather than treating content as generic SEO; third, use Savant’s live price, availability, free-pool eligibility and real usage telemetry as unique page data competitors cannot reproduce exactly.

**[MEASURED]** The three strongest risks are trust conflict, legal/source-rights exposure, and operational coupling. The site will be reviewing products it resells; Reddit’s current developer terms restrict commercial use absent appropriate permission and preserve users’ content rights; YouTube’s API policies permit embeds but prohibit downloading/rehosting audiovisual content and require independent value. citeturn619827search0turn619827search3turn619827search4 **[RECOMMENDATION]** Those constraints argue for a strict editorial firewall, metadata/excerpt-first ingestion, and complete separation of content workloads from billing admission and settlement.

**What would change my mind.** **[RECOMMENDATION]** I would reject the integrated-commerce thesis if a controlled pilot shows all three of these: fewer than roughly 5% of intentful readers open a linked model surface; contextual model modules do not materially outperform plain links; and interviews show that buyers intentionally prefer an independent research venue and an existing inference vendor. I would also reassess H1 if OpenRouter, Hugging Face or another major gateway launches a multi-source evidence feed with normalized model linking and same-account purchasing before Savant launches.

**Evidence review.** **[MEASURED]** Stack Overflow’s 2025 developer survey, with more than 49,000 respondents, reported that 84% use or plan to use AI tools, while distrust of AI-output accuracy exceeded trust; the same survey indicates developers commonly encounter AI-generated problems that send them back to technical knowledge sources. citeturn347926search0turn347926search2 A 2026 Notion survey reports that model quality, agentic capability and cost are leading selection criteria, and that 81% of its respondents actively use multiple models; because this is a vendor survey with likely selection bias, it is evidence of behavior among an AI-engaged sample, not a population estimate. citeturn347926search8

**[MEASURED]** What is **not known** is more important: there is no reliable public evidence for the consideration window from model discovery to first gateway top-up, typical number of content touches before first purchase, or causal lift from “read here, buy here” for AI inference. **[RECOMMENDATION]** Treat these as experimental variables rather than deck assumptions.

**Current journey and leakage map.**

```text
Discovery
  ↓
article / video / paper / repo / discussion
  ↓
"What exact model is this? Is it good enough?"
  ↓
benchmark / model catalog / community check
  ↓
"What does it cost? Is it available? Who do I trust?"
  ↓
gateway/provider account
  ↓
key → first call → credit/top-up → repeat
```

**[MEASURED]** Today Savant cannot capture the middle of this journey because it has neither content pages nor `/models/[id]`; aggroNATION cannot close it because it has neither a normalized model ID nor commerce. fileciteturn0file0 **[RECOMMENDATION]** Define leakage operationally as an intentful content session that either exits to a model/provider/catalog domain or ends without reaching a Savant model surface. Do **not** call that a “lost sale”: an external exit is only a proxy unless the user self-reports or later converts elsewhere.

## Competitive teardown and architectural choice

**Competitive teardown.** The table distinguishes a closed commerce loop from a partial one.

| Product | What it already does | Loop status | Copy / avoid |
|---|---|---|---|
| OpenRouter | **[MEASURED]** Large model catalog; price, context, throughput/TTFT and provider views; prepaid credits. citeturn650298search0turn650298search1turn650298search3 | Commerce strong; editorial/feed weak | **[RECOMMENDATION]** Copy dense model economics and operational metadata; avoid a catalog that begins and ends as a table. |
| Artificial Analysis | **[MEASURED]** Independent comparisons across intelligence, speed, latency, cost and context; broad model/provider coverage. citeturn650298search4turn650298search5 | Evidence strong; purchase external/indirect | Copy provenance and multidimensional comparison; avoid collapsing quality into one opaque number. |
| Hugging Face | **[MEASURED]** Model cards, Daily Papers, community signals and routed inference providers billed through HF. citeturn676399view3 | **Partially closed** | Copy graph-like proximity among papers/models/inference; differentiate through live multi-source news and gateway-specific price/access. |
| LM Arena | **[MEASURED]** Crowdsourced model comparisons and leaderboard with millions of votes reported by the project. citeturn650298search7turn650298search8 | Evidence only | Copy visible methodology; avoid presenting preference ranks as universal task quality. |
| Together AI | **[MEASURED]** Serverless catalog, context, pricing and direct API commerce. citeturn672797search0turn672797search1 | Commerce closed; little editorial | Copy clear model→API path. |
| Fireworks AI | **[MEASURED]** Per-model pages, prices and immediate query/run surface. citeturn672797search2turn672797search3 | Commerce closed; little content | Copy immediate try action and deployment availability. |
| DeepInfra | **[MEASURED]** Searchable model catalog with pricing and capabilities. citeturn672797search5turn672797search6 | Commerce closed; little editorial | Copy concise economics; add evidence rather than another catalog clone. |
| Groq | **[MEASURED]** Model detail pages show price, context/capabilities and Playground CTA. citeturn672797search7turn672797search8 | Commerce/trial closed; little editorial | Copy prominent try action and latency context. |
| LiteLLM | **[MEASURED]** One gateway across 100+ providers plus cost/model maps, virtual keys and spend controls. citeturn964501search0turn964501search2 | Infrastructure, not media | Copy gateway observability concepts, not product positioning. |
| Portkey | **[MEASURED]** Gateway catalog, pricing and governance over a large model universe. citeturn964501search7turn964501search9 | Infrastructure, not media | Copy governance/route reliability. |
| APInex | **[MEASURED]** One API/key/balance plus model pricing, datasheets, comparisons, guides, benchmarks and recipes. citeturn676399view0turn676399view1 | **Closest direct partial loop** | Copy resource→catalog continuity; Savant must exceed it with freshness, normalized evidence and in-reading commerce. |
| Command Code | **[MEASURED]** Same API key, credits and accounting across model-provider API access, with educational/blog surfaces. citeturn676399view2 | Partial | Copy same-account simplicity. |
| Amazon | **[MEASURED]** Product pages colocate ratings/reviews and purchase; verified-purchase labeling is a trust device. citeturn943808search14 | Closed | Copy evidence near action; avoid letting popularity substitute for technical validity. |
| Wirecutter | **[MEASURED]** NYT states editorial selections follow testing/editorial standards rather than affiliate deals, though it can earn commissions. citeturn862447search3 | Affiliate commerce | Copy explicit editorial independence and disclosure. |
| Tripadvisor | **[MEASURED]** Reviews, comparison and booking paths coexist on one shopping surface. citeturn943808search4 | Partially/fully closed depending booking | Copy decision-stage evidence aggregation; avoid review-volume gaming. |
| Product Hunt | **[MEASURED]** Launch/product pages combine descriptions, reviews, comments, community ranking and outbound “visit website” action. citeturn737951search0turn737951search3 | Discovery→outbound, not purchase | Copy maker identity/community context; avoid treating engagement as quality proof. |

**Integration architecture.**

| Option | Billing isolation | SEO / one origin | Freshness | Operational complexity | Migration fit | Weighted score* |
|---|---:|---:|---:|---:|---:|---:|
| Unified app + DB, ingestion inside app | 2/5 | 5/5 | 5/5 | 4/5 | 5/5 | 3.9 |
| Separate content service + gateway | 5/5 | 3/5 | 5/5 | 2/5 | 3/5 | 3.7 |
| **Content schema in gateway Postgres + separate worker/read boundary** | **5/5** | **5/5** | **5/5** | **4/5** | **5/5** | **4.8** |
| Static/ISR dossiers | 5/5 | 5/5 | 2/5 | 4/5 | 4/5 | 4.0 |

\* **[RECOMMENDATION]** Scores are a decision model, not measured performance; weights favor billing isolation, one-origin SEO/auth, and migration safety.

**[RECOMMENDATION]** Choose option three: after the Postgres cutover, put content in a separate `content` schema in the same managed Postgres cluster, but run ingestion in a separate worker/scheduler with its own database role and connection pool. The gateway renders content through a bounded read layer; inference admission, holds, settlement and key validation make **zero** calls into content code. Feature flags must be capable of removing all content modules without a database rollback.

**[RECOMMENDATION]** Use database-level separation as well as module separation: a read-only content role for web rendering, a writer role for ingestion, low connection caps, `statement_timeout`, query budgets, cached model-page evidence blocks, and no content transaction that locks billing tables. Live price/access should come from the existing catalog/billing read model, not from the content worker.

**[RECOMMENDATION]** Ingestion should use a lease/advisory lock keyed by source, hard runtime deadlines, idempotent upserts, a fetch-cycle record, source-specific retries and circuit breaking. GitHub Actions can remain a cheap scheduler initially, but the ingestion code should be deployable as a standalone worker. GitHub currently charges Linux hosted runner usage by the minute beyond included quotas; a five-minute hourly job is 3,600 minutes/month, while daily is 150 minutes/month. With 2,000 included private-repo minutes and a $0.006/minute 2-core Linux overage rate, the illustrative hourly overage is `(3,600−2,000)×$0.006 = $9.60/month`. citeturn276760search0turn276760search3

## Content graph, model experience, and shoppable content

**Content-to-model graph.** **[RECOMMENDATION]** The core schema should be explicit and auditable:

```text
content_sources
  id, type, name, canonical_url, rights_mode, cadence, enabled

content_items
  id, source_id, external_id, type, title, excerpt, canonical_url,
  author, published_at, sanitized_html?, content_hash, language,
  source_metrics_json, created_at, updated_at

model_aliases
  id, model_id, alias, normalized_alias, family, version,
  provider_hint, valid_from, valid_to, priority

content_model_links
  content_id, model_id, link_type, confidence, method,
  evidence_span_hash, status, reviewed_by, reviewed_at, stale_at

evidence_items
  id, content_id, model_id, evidence_type, tier,
  claim_scope, provenance_url, published_at

editorial_reviews
  id, model_id, author_id, methodology_version, tested_at,
  pros, cons, test_cases, reproducibility_url, disclosure

engagement_snapshots
  content_id, captured_at, views, likes, comments, raw_metrics_json

fetch_cycles
  id, source_id, started_at, finished_at, status, item_count, error_code
```

**[RECOMMENDATION]** Use a staged resolver, not one LLM call. Exact catalog IDs/versioned aliases come first; normalized provider/family/version patterns second; metadata context third; embeddings retrieve candidates only; an LLM classifier decides among a small candidate set; human review handles ambiguity. High-confidence corrections should feed the alias dictionary.

| Link confidence | Behavior |
|---|---|
| **≥0.98** exact/version-supported | **[RECOMMENDATION]** Auto-publish model hyperlink and commerce-capable inline module. |
| **0.90–0.979** multi-signal match | Link to model detail; label evidence conservatively; sample for audit. |
| **0.70–0.899** ambiguous | Hide from users; send to review queue. |
| **<0.70** | Reject unless manually asserted. |

**[RECOMMENDATION]** “GPT,” “Claude,” “Opus” and “Sonnet” should normally resolve only to a family concept, not a purchasable model. Versioned names can resolve to an exact model when the alias, surrounding text and publication date agree. A rename/deprecation event should invalidate affected aliases and mark links stale. Evidence predating a model version must not silently migrate forward to the replacement.

**[ASSUMPTION]** If an inexpensive inference model consumes 3,000 input and 150 output tokens per classification, Groq’s current GPT-OSS-20B list prices of $0.075/M input and $0.30/M output imply `3,000/1M×0.075 + 150/1M×0.30 = $0.00027/item`: about **$2.70 per 10k**, **$27 per 100k**, or **$270 per 1M** classification passes. citeturn672797search7 **[RECOMMENDATION]** Budget 2× that number for retries/audits, but recognize that human ambiguity review, not tokens, will dominate cost.

**Model page specification.** **[RECOMMENDATION]** `/models/[id]` should be the canonical decision page, ordered: identity/status → live price/access CTA → capabilities and constraints → first-party operational data when sample size is sufficient → independent evidence → benchmarks → comparisons → tutorials/videos/repos/community → first-party review → API example/provenance/change history. Show three to five evidence items per module before “view all.” Do not create a universal “quality score”; expose dimensions, test conditions and uncertainty.

**[RECOMMENDATION]** Empty states should be factual: “No independent benchmark linked to this version” or “No first-party latency sample yet,” never synthetic reviews or placeholders. Anonymous users see public economics and evidence; signed-in users can also see allowance state, balance-aware CTA, saved/followed models, price alerts and usage-aware recommendations.

**Wireframe A — desktop model page.** **[RECOMMENDATION]** A sticky right rail contains price per million input/output tokens, availability, context, access group and CTA. The main column starts with model identity, then “Independent evidence” cards carrying evidence-tier chips, source, date and exact-version linkage; below that are benchmark dimensions, comparisons, tutorials and discussions.

**Wireframe B — article.** **[RECOMMENDATION]** The article remains primary. The first confirmed model mention becomes a restrained text link; after the first substantive evaluative paragraph, one inline module shows exact model/version, current price, context, availability, free eligibility and “View model”/state-aware access CTA. Repeated mentions do not repeat the module.

**Wireframe C — mobile.** **[RECOMMENDATION]** The model page collapses commercial state into a compact header and optional bottom action bar. Evidence remains above secondary community content. The article module becomes a two-row card with no horizontal scrolling and no interstitial behavior.

**Shoppable content specification.** **[RECOMMENDATION]** Automatic body links are acceptable only for exact high-confidence matches. Editorially confirmed links can carry stronger semantics such as “review,” “benchmark” or “tutorial”; machine-only associations should never imply endorsement. A small “Why this model?” affordance can disclose the matching evidence.

**[RECOMMENDATION]** The purchase path should be:

```text
content
 → exact model page
 → state-aware CTA
 → signup/login if needed
 → key creation or top-up
 → Stripe Checkout if credit is needed
 → return to the same model + original content attribution
 → first API call
```

**[MEASURED]** Savant currently uses hosted Stripe Checkout, so literal “never leaves the page” would be false. fileciteturn0file0 Stripe supports hosted and embedded Checkout patterns, and Checkout/Elements can keep card data out of the merchant server’s environment for SAQ-A-style PCI scope; direct raw-card handling materially increases compliance burden. citeturn189885search1turn557518search0 **[RECOMMENDATION]** Launch with hosted Checkout and describe the promise as “one site, one account, one balance”; measure redirect abandonment before paying the engineering cost of embedded Checkout.

## Content hub, evidence quality, trust, and engagement

**Content hub specification.** **[RECOMMENDATION]** Keep aggroNATION’s source diversity but change the storage default from “rehost when technically possible” to “metadata + excerpt + canonical source unless rights explicitly permit full text.” YouTube should be embedded, not copied; current YouTube API policies prohibit downloading/cache-rehosting audiovisual content and require compliant attribution and independent value. citeturn619827search0 Reddit content should not be treated as freely reusable commercial inventory: Reddit’s 2026 terms preserve user rights and impose commercial-use restrictions/approval requirements around its APIs and developer platform. citeturn619827search3turn619827search4

**[RECOMMENDATION]** Replace the aggregator’s purchase-decision ranking with a model-evidence score such as `0.35 relevance + 0.25 evidence authority + 0.20 freshness + 0.10 normalized engagement + 0.10 diversity/independence`. This is a design prior, not a discovered optimal weighting. Engagement should be log-scaled/winsorized and source-normalized so a viral social item cannot outrank reproducible technical evidence purely through volume.

**[RECOMMENDATION]** Search should combine models and content with facets for family, exact model, evidence type, source, date and content type. Index high-value model pages, original reviews and legally renderable unique content; noindex thin tag combinations, low-value listings and duplicated syndicated bodies.

**[MEASURED]** Google defines scaled-content abuse around producing many pages primarily to manipulate rankings without sufficient original value, whether generated by automation, humans or combinations; its generative-AI guidance emphasizes accuracy, quality and added value rather than banning AI-assisted content per se. citeturn233080search0turn233080search1 **[RECOMMENDATION]** A model page should therefore earn indexability through live Savant economics/availability, version-specific evidence, first-party operational measurements and editorial context—not a templated summary.

**Reviews and evidence specification.** **[RECOMMENDATION]** Use an evidence hierarchy rather than a blended reputation score: official release/docs for factual capabilities; independent reproducible benchmarks for task claims; first-party hands-on reviews with disclosed methods; specialist third-party reviews; news; then community/social discussion. Official vendor results must be visibly marked “vendor-reported.”

**[RECOMMENDATION]** First-party reviews require author identity, exact model/version, date, tested use cases, parameters, sample count, methodology version, reproducible prompts/code where safe, pros/cons, known limitations, commercial disclosure and correction history. User ratings should not launch until anti-spam and verified-usage semantics exist.

**[MEASURED]** Google’s review-snippet rules require genuine visible review content and prohibit misleading or aggregated markup patterns; for product-style editorial pages, structured data must correspond to content actually shown. citeturn233080search2turn233080search3

**Editorial independence and trust policy.** **[RECOMMENDATION]** Editorial ranking must be unable to read provider margin, sponsorship status or markup percentage. Review authors may publish negative findings on models Savant sells. Sponsored material belongs in a separately labeled content class and is excluded from evidence scoring. Every first-party review should disclose, near the review rather than in a footer, that Savant sells access to models discussed.

**[MEASURED]** FTC guidance requires material connections between endorsers and sellers to be disclosed clearly, and the agency’s review/endorsement guidance expects businesses to maintain genuine review practices. citeturn233080search5 Wirecutter provides a useful analog: its parent’s help material states product choices are based on editorial/testing standards rather than affiliate arrangements even though purchases can generate commissions. citeturn862447search3

**Engagement loops.** **[RECOMMENDATION]** Ship saves and followed models first because they map directly to user intent and can power digest/price-change notifications without public moderation. Price alerts should be event-driven from catalog changes; a weekly followed-model digest should combine only new evidence and material price/availability changes. Comments and reactions are lower priority operationally—not because scope should be reduced, but because they should appear later in the dependency sequence after moderation, abuse reporting, rate limits and identity controls exist. Product Hunt’s use of comments, reviews and maker identity demonstrates the value of visible participant context, but its own ranking system also uses multiple engagement signals rather than raw upvotes. citeturn737951search2turn737951search4

## Funnel economics, legal controls, and experiments

**Monetization and funnel.** **[RECOMMENDATION]** Instrument server-side events for: content impression → engaged read/watch → inline module view → model-page visit → CTA click → account creation → key creation → first API call → first top-up → repeat paid usage. Preserve `content_id`, `model_id`, source and first/last-touch campaign identifiers on the server; avoid cross-site fingerprinting.

| Metric | Exact definition |
|---|---|
| Link precision | `confirmed-correct rendered model links / reviewed rendered links` |
| High-confidence auto-link precision | `correct auto-published links / audited auto-published links` |
| Content→model CTR | `sessions reaching linked /models/[id] / sessions with eligible model-module view` |
| Model CTA rate | `CTA clicks / model-page sessions` |
| Signup conversion | `new accounts / anonymous model-page sessions` |
| Activation | `new keys with first successful inference ≤24h / new keys` |
| Paid conversion | `content-origin users with first top-up ≤7d / content-origin activated users` |
| Leakage proxy | `known external catalog/provider exits / intentful content sessions` |
| Repeat-use rate | `paid users with successful usage in next 30d / first-time paid users` |
| Correction rate | `retracted/corrected evidence links / published evidence links` |
| Ops burden | `human moderation + entity-review minutes / 100 ingested items` |
| Gateway guardrail | p95/p99 inference latency, admission error rate and settlement discrepancy rate vs pre-content baseline |

**[MEASURED]** The pre-launch leakage rate is unknowable because there are no real customers or production traffic yet. fileciteturn0file0 **[RECOMMENDATION]** Do not invent a “current 60% leakage” baseline. Establish one only after production instrumentation.

**Experiment plan.**

| Experiment | Primary hypothesis | Illustrative baseline→effect | Approx. n/arm* | Guardrail |
|---|---|---:|---:|---|
| Confirmed body link vs plain model name | H3 | **[ASSUMPTION]** 10%→15% model-page CTR | 686 | no trust/correction increase |
| Inline live-price/access card vs text link | H4 | **[ASSUMPTION]** 20%→30% progression | 294 | article engagement not materially lower |
| Evidence-tier block vs generic “related” | H2/H4 | **[ASSUMPTION]** 10%→15% CTA rate | 686 | no page-performance regression |
| Hosted vs embedded checkout, later | friction | **[ASSUMPTION]** 30%→45% completion | 163 | payment/support errors |
| Curated 20–30-item usability study | H2/H3/H4 | qualitative | 15–25 target users | disclose commerce conflict |

\* **[ASSUMPTION]** Two-sided α=.05, 80% power, fixed-horizon two-proportion approximation; these are planning numbers, not expected outcomes. **[RECOMMENDATION]** Pre-register one primary outcome, do not repeatedly peek, and stop early only for safety/payment/billing guardrails.

**[RECOMMENDATION]** The cheapest experiment that materially reduces uncertainty is the curated task study: use real evidence for 5–10 real catalog models, exact links and working price/access states, then observe target developers choosing a model and attempting access. It directly tests whether the bridge feels useful or commercially biased before automation scale obscures the answer.

**Unit economics.** **[ASSUMPTION]** At 10,000 new content items/month, if 5% require 45 seconds of manual entity review, labor is `10,000×0.05×45/3,600 = 6.25 hours/month`. At an illustrative $100/hour operator opportunity cost, that is **$625/month**; at 100,000 items it becomes **62.5 hours/$6,250**, which makes precision automation economically decisive.

**[ASSUMPTION]** Using the earlier $0.00027/item classifier estimate, a 10k-item month with two classification passes costs about **$5.40**. A managed Supabase-style Postgres plan currently starts around $25/month with included database/storage allowances, while storage overage is relatively modest compared with operator labor. citeturn276760search5 An illustrative 20 KB/item database footprint implies 0.2 GB at 10k, 2 GB at 100k and 20 GB at 1M items; the real number must be measured after indexes, HTML and search vectors exist.

| Scale | **[ASSUMPTION]** Incremental infra/automation | Dominant cost |
|---|---:|---|
| 10k stored items / ~1k users | $30–60/mo above gateway baseline | human review |
| 100k / ~1k–10k users | $40–100/mo | human review + DB/search compute |
| 1M / ~10k users | $75–250/mo | DB/search/egress; depends heavily on page traffic |
| Hourly ingestion | add roughly $0–10/mo runner cost at low runtime | source/API quotas |
| Daily ingestion | generally within common included runner quota | freshness loss |

These are **[ASSUMPTION]** planning ranges, not quotes; current Savant’s modeled ~$24/month base belongs to the operator’s measured fact sheet. fileciteturn0file0

**[ASSUMPTION]** A useful payback equation is `monthly sessions × incremental paid conversion × first-top-up × gross margin × lifetime multiplier`. For example, `20,000 × 1% × $20 × 20% × 2 = $1,600` incremental lifetime gross profit. If monthly content cost were $700, break-even incremental conversion under those assumptions is `700/(20,000×20×0.20×2)=0.4375 percentage points`. The unknown inputs—actual gross margin, typical top-up and retention multiplier—must come from Savant production data.

**Legal and ethical checklist.** **[RECOMMENDATION]** Before enabling each source, maintain a row containing rights basis, API/robots requirements, permitted stored fields, full-text permission, attribution, deletion requirement and commercial-use status. Default to excerpts/canonical links. Do not train/tag with source material where platform terms prohibit that use; treat all fetched text as untrusted input to classifiers, strip active HTML, cap tokens, give the classifier no tools/secrets and require schema-constrained output.

**[RECOMMENDATION]** Add a published DMCA/takedown contact, correction procedure, source opt-out, trademark nominative-use rules, privacy disclosure for saved items/comments/analytics, retention periods, cookie controls where legally required, and moderation rules covering harassment, malware, NSFW content and prompt-injection payloads. Model-speed or quality claims should always carry measurement date, workload and provenance rather than absolute language.

## Delivery roadmap, decision rules, and rejected patterns

**Delivery roadmap.** **[RECOMMENDATION]** Full target scope is realistically **16–20 calendar weeks** for one highly experienced operator after the Postgres work begins, roughly **560–900 focused engineering hours** depending on migration surprises, source-rights remediation and moderation depth. That estimate is not a productivity judgment; the scope contains a database cutover, ingestion productionization, entity resolution, new public UX, commerce attribution, editorial systems, legal controls and performance isolation.

| Dependency sequence | Time | Acceptance criterion |
|---|---:|---|
| Postgres cutover + baseline hardening | 1–2 weeks | one production datastore; billing parity; rollback tested; latency/error baseline captured |
| Content schema, source-rights registry, ingestion worker | 2 weeks | idempotent cycles; no content connections in billing path; source failures isolated |
| Model aliases, graph resolver, review queue | 2–3 weeks | ≥99% precision target for purchase-capable links on audited corpus |
| `/models/[id]`, evidence ranking, search/facets | 2–3 weeks | truthful empty states; cached evidence; accessibility/perf gates |
| Inline modules + CTA state machine + attribution | 2 weeks | all account/free/paid/subscription states tested end-to-end |
| Reviews/editorial tooling/moderation/engagement | 2–3 weeks | disclosure/correction/moderation workflows operational |
| SEO, structured data, sitemaps, mobile/CWV | 1–2 weeks | no thin-page indexing; schema validation; canonical rules tested |
| E2E, load/failure testing, legal launch audit | 2 weeks | content kill switch; billing invariants unchanged; source matrix signed off |

**[RECOMMENDATION]** The **first two weeks** should complete the Postgres cutover, database/performance baselines, content schema migrations and source-rights matrix—no production content UI before those gates pass. The **first month** should additionally deliver the independent ingestion worker, first real content records in staging, deterministic/versioned alias resolution, a review queue and the initial `/models/[id]` route. This sequences dependency, not ambition; the full target remains unchanged.

**Build vs buy.** **[RECOMMENDATION]** Buy/consume mature libraries for RSS/Atom parsing, HTML sanitization and Stripe; use Postgres full-text search first because the database is already required; add `pgvector` only when semantic retrieval demonstrably improves entity candidate recall; keep model-link policy, evidence ranking, editorial workflow and CTA state machine in-house because they encode the actual differentiation. Media should remain at source whenever possible rather than creating a new storage/CDN liability.

**Metrics and decision rules.** **[RECOMMENDATION]** Expand automation when rendered-link precision is ≥99%, model-link correction rate remains <1%, content p95 page performance remains within the site budget, and content-origin progression improves without trust/support deterioration. Pause auto-link publishing below 97% audited precision. Any settlement discrepancy attributable to content integration, any content dependency on the inference admission path, or material inference-latency regression should trigger immediate content feature-flag rollback.

**[RECOMMENDATION]** Treat a **≥25% relative improvement** in content→model progression and **≥15% relative improvement** in downstream paid conversion as useful expansion signals once sample sizes are sufficient; these are management thresholds, not market benchmarks. Kill the commerce thesis—not the reusable content assets—if repeated tests show no meaningful movement in model-page progression or paid activation and trust research indicates the reseller/editor conflict is the cause. In that case, the strongest alternative use of aggroNATION is as a **model-intelligence and acquisition engine**: evidence monitoring, catalog enrichment, operator research, newsletter/search acquisition and competitive alerting, without presenting editorial content as an integrated purchase funnel.

**Anti-patterns and rejected ideas.** **[RECOMMENDATION]** Reject automatic purchase links on ambiguous family names; full-text rehosting by default; engagement-only evidence ranking; margin-weighted editorial ordering; undisclosed sponsored reviews; a synthetic universal model score; programmatic pages that merely rewrite upstream descriptions; ingestion inside the gateway billing process; direct card-data handling when Stripe-hosted components suffice; LLM classifiers with tools/secrets exposed to scraped content; and claiming “no external navigation” while using hosted Stripe Checkout. Google’s scaled-content rules make thin programmatic SEO particularly risky, while FTC disclosure guidance makes hidden commercial influence a trust and regulatory problem. citeturn233080search0turn233080search5

**Open questions for the operator.** **[ASSUMPTION]** These are decisions the evidence cannot resolve externally: target launch geography; actual gross margin by model/provider; expected first-top-up size; preferred managed Postgres vendor; whether Reddit commercial/API permission will be pursued; which feeds have explicit full-text redistribution rights; whether named human authorship will be used for original reviews; whether anonymous comments are acceptable; which 20–30 models deserve launch-day editorial coverage; acceptable monthly operator-hours for moderation/entity review; and whether an embedded Stripe flow should be considered only after hosted-checkout abandonment is measured.

## Source and research register

**[MEASURED]** Research was accessed on **November 1, 2026**. The product-state baseline comes from the operator’s supplied codebase review and fact sheet. fileciteturn0file0 Public evidence used above prioritizes official/current product and policy pages: OpenRouter model/pricing surfaces. citeturn650298search0turn650298search3 Artificial Analysis benchmark/model comparison. citeturn650298search4turn650298search5 Hugging Face Inference Providers. citeturn676399view3 LM Arena. citeturn650298search7turn650298search8 Together, Fireworks, DeepInfra and Groq catalogs/pricing. citeturn672797search0turn672797search3turn672797search6turn672797search8 LiteLLM and Portkey gateway/catalog documentation. citeturn964501search0turn964501search7 APInex and Command Code. citeturn676399view0turn676399view2 Stack Overflow and Notion developer surveys. citeturn347926search0turn347926search8 Google Search policies. citeturn233080search0turn233080search1turn233080search2 FTC endorsement guidance. citeturn233080search5 Stripe PCI/Checkout documentation. citeturn557518search0turn189885search1 YouTube and Reddit developer policies. citeturn619827search0turn619827search3turn619827search4 Supabase and GitHub pricing. citeturn276760search5turn276760search3 Product Hunt and Wirecutter trust/community patterns. citeturn737951search3turn862447search3