# Gemini Deep Research prompt — single-surface content-to-commerce

Paste everything below the horizontal rule into Gemini Deep Research. It is
self-contained: no repository access, credentials or prior context are needed.
Facts marked **measured** were verified against the two codebases on 2026-11-01;
facts marked **assumption**, **hypothesis** or **recommendation** must be
challenged, not accepted. The operator wants a decision-quality research report,
not code.

---

## Role and objective

You are a product, growth and commerce strategist for an independent AI
infrastructure business. The operator owns two codebases and has a specific
thesis to test, not a generic content-marketing question.

**The thesis:**

> No existing site combines a live AI content/news aggregator with the ability
> to purchase inference at the point of reading. Today a developer reads about a
> model on one site, compares it on another, then goes to OpenRouter or leaves
> the gateway to buy. The target is one surface where the same journey — watch
> or read the evidence, judge the model's quality, see its live price and
> access, open the model page, and buy — happens without leaving the site,
> opening a second account, or losing the purchase to an external catalog.

The two products are the two halves of that surface:

1. **Savant Gateway** — an OpenAI-compatible inference gateway with a public
   model catalog, live prices, free/paid/subscription access, prepaid credit,
   and an operator console. It has the commerce and the model data, but no
   content.
2. **aggroNATION** — an AI content aggregator that ingests YouTube, RSS,
   Reddit, Hugging Face Daily Papers, Trendshift and Open Source Projects,
   ranks items by engagement and freshness, and renders an on-site feed,
   article reader, video watch page, search, tags, comments, bookmarks and an
   admin source console. It has the content and the audience, but no commerce
   and no normalized model entity.

The operator is an experienced engineer (25+ years of programming, including
pre-AI hand-written code) who has run multi-million-dollar businesses alone.
Design the full integration and estimate time, cost and dependencies honestly.

## 1. The two products

### 1.1 Savant Gateway

| Dimension | Current state |
| --- | --- |
| Category | Independent inference gateway / reseller. One OpenAI-compatible endpoint over one or more upstream providers. |
| Stack | Next.js 16.4.3 App Router, React 19.3.0, HeroUI 3.2.7, Tailwind CSS 4, TypeScript strict, Node >= 22.18. |
| Storage | SQLite (`better-sqlite3`, WAL, one process) in the running app. A PostgreSQL port and cutover are designed and converged (FID-085/086) but **not executed**; the running app still uses SQLite. |
| Public surfaces | `/` landing, `/models` searchable/sortable catalog table, `/compare` two-model comparison, `/plans`, `/docs`, `/docs/start`, `/docs/faq`, `/support`, `/terms`, `/privacy`, `/refunds`, `/acceptable-use`, versioned legal pages. |
| Account surfaces | `/signup`, `/login`, `/account` (balance, keys, usage, ledger, plan, top-ups, support). |
| Operator surfaces | `/admin` overview, customers, catalog, groups, plans, subscriptions, providers, pricing, analytics, reconciliation, support, operations. |
| Catalog fields | Public model id, name, family, context window, group (billing tier), input/output sell price per 1M tokens, capabilities, benchmark data where available. Public identity is always `owned_by: "savant-gateway"`. |
| Billing | Integer micro-dollars; credit holds before dispatch; actual-usage settlement; free/paid/subscription groups; prepaid Stripe top-ups; NOWPayments crypto lane (default off); plans implemented but `PLAN_SALES_ENABLED` is off. |
| Current model page | **There is no per-model detail page and no per-model purchase route.** `/models` is one large table; `/compare` handles a pair. A `/models/[id]` destination does not exist. |
| Content capability | **None.** No content tables, no CMS, no XML parser, no HTML sanitizer, no cron endpoint, no content admin, no model-to-article linking. |
| Maturity | Pre-launch. Not deployed, no live payment, no live paid inference, no real customers. Reported gates: 394 unit tests, 750 HTTP checks, clean lint/typecheck/quality/build at the current tree (2026-10-31 project status). |
| Audience | Developers running coding agents and API workloads: Cursor/Claude Code/Cline/Aider users, indie SaaS builders, students, budget-conscious teams, multi-model experimenters. |
| Business model | Sell inference access at a markup over upstream cost; prepaid credit; subscriptions planned but not sold; a daily shared free allowance is the current acquisition path. |
| Checkout today | Stripe Checkout (hosted redirect) for prepaid top-ups; crypto lane documented but default-off. Any "buy without leaving" design must state honestly where the redirect goes and how the user returns. |
| Strategy already written | A 12-week original technical-content roadmap (Cursor BYOK, Claude Code without an Anthropic account, Aider cost reduction, streaming JSON errors, 429 fallback routing, USDC funding, long-context trade-offs, Cline setups, model comparisons, Stripe-vs-crypto, bill-shock prevention, latency report). It names technical educational content as an acquisition wedge. |

### 1.2 aggroNATION

| Dimension | Current state |
| --- | --- |
| Category | AI content aggregator. Surfaces the most engaging recent content from curated sources and ranks it by engagement + freshness. |
| Stack | Next.js 16.2.6, React 19.2.6, HeroUI 3.2.4, Supabase Postgres, Vercel, GitHub Actions hourly cron. |
| Sources | Six first-class types: YouTube, RSS/Atom, Reddit (official Atom feeds), Hugging Face Daily Papers, Trendshift (bespoke scraper), Open Source Projects (feed + impressions scraper + GitHub enrichment). |
| Ingestion | One orchestrator; per-source failure isolation; deterministic content ids `{sourceType}_{externalId}`; idempotent upserts; per-source auto-disable after consecutive failures; configuration errors do not auto-disable; resolution cache for YouTube; fetch-cycle records; daily quality scrub; momentum baseline refresh. |
| Content model | Source registry, content items (title, excerpt, optional full feed body, canonical URL, thumbnail, author, published time, tags, metrics, GitHub repo facts), comments, fetch cycles. **There is no normalized model entity** — content is tagged by source type and free-form tags, not by catalog model id. |
| Ranking | `rating = engagement × 0.6 + freshness × 0.4`, engagement `= (likes×2 + comments×3) / views`, freshness `= exp(−ageDays / 14)`. Stored as a fetch-time snapshot. RSS/Reddit items have no engagement numbers, so their score is effectively freshness-only. |
| Public surfaces | Home with diversified sections (newest 3 per source), type listings (`/youtube`, `/rss`, `/reddit`, `/huggingface`, `/trendshift`, merged `/github`), pagination, `/search`, `/tags/[tag]`, `/rising`, `/digest`, `/status`, `/about`, `/article/[id]` reader, `/watch/[videoId]` video page, `/saved`, comments, bookmarks, reactions. |
| Operator surfaces | `/admin` source CRUD, bulk import, per-source Fetch now, health chips, soft/hard delete, pagination/sorting. |
| Design intent | On-site consumption ("no-exit" product law): articles are stored/sanitized and rendered in-app, YouTube videos play on-site, titles and cards link to on-site pages rather than outbound. |
| Maturity | Last committed 2026-09-05 (`f383320`). The two reviewed backups are byte-identical apart from line endings and four local-only artifacts. Unit tests cover pure logic only (9 test files); no HTTP/e2e suite. 27 unarchived FIDs vs 26 archived — bookkeeping drift. The README references a live demo at `aggro-nation.vercel.app`; **live status was not verified in this review.** |
| Known fragility | YouTube requires a valid Data API key and quota; Reddit returns 429s; Trendshift is a hand-written scraper governed by robots.txt; Open Source Projects impressions depend on allowed post pages; unauthenticated GitHub is 60 requests/hour. |
| License | MIT, so code reuse is compatible with the gateway's Apache 2.0, but the operator intends a new build rather than an import. |

### 1.3 The current leak

The thesis is about a specific loss, not "content marketing" in general:

```text
TODAY
search / social / newsletter / video
        |
        v
content site: article, video, paper, repo, review
        |
        |  "this model looks good — where do I try or buy it?"
        v
leave the site  --->  OpenRouter / provider / another catalog
        |
        v
create account, add payment, run the model
```

The content earns the attention; the external catalog takes the purchase. The
gateway's catalog is a price table with no per-model page, so even a reader who
wants to buy has no destination inside the product.

```text
TARGET
search / social / newsletter / video
        |
        v
content on the gateway: article, video, review, paper, repo
        |
        |  model name or inline model module -> /models/[id]
        v
model page: live price, free allowance, availability,
            evidence, reviews, comparison, "get access"
        |
        v
same site, same account, same checkout
```

The exact meaning of "without leaving" is one of the research questions. It
should at minimum mean one origin, one account and one checkout. It may also
mean an on-site drawer or modal for the purchase step, and it must be honest
about any hosted payment redirect (Stripe Checkout currently leaves the site
briefly and returns).

### 1.4 What is shared — and what is not

**Shared:** the same operator, the same broad audience (AI developers), the same
UI stack (Next.js + HeroUI + Tailwind), a model-adjacent subject matter, and a
belief that fresh evidence helps a developer choose.

**Not shared:** the database engine and deployment model (SQLite on one process
vs Supabase on Vercel), the auth systems (gateway customer/admin sessions vs
Supabase auth), the data model (catalog models vs free-form content), the
business model (paid inference vs free content), and the maturity level (both
pre-launch, but the gateway has the money path and the aggregator has the
content pipeline).

**The central data gap:** aggroNATION does **not** currently know that a piece
of content is about `claude-opus-5.5` or `deepseek-v4.1-flash`. It knows the
source, type, title, body, tags and metrics. Linking content to catalog models
is a new entity-resolution layer, not a join that already exists. Treat that as
the hardest and most important design problem, because the in-article purchase
link depends on it.

## 2. The thesis and hypotheses

State clearly whether each hypothesis is supported, unsupported, or unknown
after reviewing the evidence. Do not assume they are true because they sound
plausible.

- **H1 — The gap is real.** No major AI inference catalog or aggregator combines
  a live content/news feed with immediate purchase of the model being discussed.
  Verify this across direct competitors and adjacent products. If it is false or
  only partly true, say exactly where.
- **H2 — The single surface reduces leakage.** A developer who can evaluate and
  buy on the same site converts at a higher rate than one who leaves to research
  and then buys at OpenRouter, a provider, or another catalog. The lost purchase
  is the metric to move.
- **H3 — In-content model links create qualified intent.** Turning model names
  and mentions in articles, videos, reviews, papers and repositories into links
  to the exact model page — with an inline model module at the point of
  judgment — is the bridge between reading and buying.
- **H4 — The purchase moment is contextual.** Live price, free allowance,
  availability, comparison and a clear "get access" action at the point of
  judgment convert better than a generic "sign up" banner or a separate pricing
  page.
- **H5 — The link must be structured.** A real content-to-model graph (explicit
  links, evidence types, confidence, review workflow) is required; keyword
  matching or free-form tags will produce false or stale associations that
  erode trust.

**Counter-thesis to test:** content plus commerce may not work. Readers may
perceive a review of a model the site sells as biased; content operations may
not pay back; users may still leave for price, trust, or an existing
relationship; Google may treat programmatic model pages as thin content. Test
these with evidence. If the evidence does not support the thesis, say so
directly and name the strongest alternative use of the content assets — not a
reduced version of the same integration.

## 3. Constraints and context

1. **One experienced operator, full scope.** The gateway is not deployed, sells
   nothing, and has no real customers. The operator has 25+ years of programming
   experience and has run multi-million-dollar businesses alone. Design the full
   integration and estimate the real time, cost and sequencing honestly.
2. **Storage sequencing.** The gateway is mid-migration from SQLite to managed
   Postgres. The running app still uses SQLite; the Postgres cutover is designed
   but not executed. Any content schema must land on the Postgres side, after
   the cutover, and must not create a dual-database window. This is a technical
   dependency, not a scope reduction.
3. **Billing integrity is sacred.** Content must never be able to block, slow or
   corrupt admission, holds, settlement, credit or keys. Ingestion and content
   reads need timeouts, failure isolation and a feature flag. A content outage
   must not affect the gateway.
4. **No fake data, no placeholders.** Every page must describe behavior the code
   performs; empty states must be honest. Do not propose mock reviews, invented
   benchmarks, synthetic engagement, or "coming soon" surfaces presented as live.
5. **Copyright and terms.** The aggregator stores full feed bodies and renders
   on-site. The gateway is a commercial product. Rehosting third-party article
   text, thumbnails, video or Reddit content has legal exposure. The plan must
   distinguish excerpt/link-out from licensed full-text use and must respect
   robots.txt, API terms and DMCA.
6. **Editorial independence is a design requirement.** The site sells access to
   the models it reviews. That is a conflict of interest whether or not it feels
   like one. The plan must define an editorial firewall, disclosure, methodology
   and correction policy; "trust us" is not a control.
7. **The purchase flow must be described honestly.** Stripe Checkout is a hosted
   redirect today. "Buy without leaving" must distinguish same-origin,
   one-account, one-checkout from a literal no-redirect flow. If embedded
   checkout, a payment element, saved payment methods or a crypto invoice would
   materially improve conversion, evaluate them against PCI scope, engineering
   cost and user trust.
8. **Existing stack and quality gates.** Prefer the current
   Next.js/Postgres/TypeScript stack. New dependencies (RSS/Atom parser, HTML
   sanitizer, embedding model, search, checkout SDK) need a build-vs-buy
   justification and a cost estimate. The repository enforces a 400-line file
   ceiling, zero lint warnings, strict TypeScript, unit tests and HTTP checks;
   propose module boundaries that keep the full scope maintainable.
9. **Budget and time are real, not a reason to shrink.** Infrastructure is
   judged on absolute monthly cost (roughly USD 24/month is the current modeled
   gateway cost); the operator's ~USD 300 is upstream working capital, not
   content budget. Estimate content ops time, moderation load and infrastructure
   cost precisely, and show the arithmetic; do not use cost as a reason to
   propose a reduced product without showing that arithmetic.
10. **Audience overlap is an assumption.** Do not assume that readers of AI
    content are the same people who will buy inference. Test the overlap and the
    willingness to buy from a content site.

## 4. Research questions

Answer these with current evidence. Cite sources with URLs and dates. Where a
number is a vendor claim, label it as such.

### A. Verify the gap and map the leak

- Is H1 true? Check OpenRouter, Artificial Analysis, Hugging Face, LMSYS
  Chatbot Arena, Together AI, Fireworks AI, DeepInfra, Groq, LiteLLM, Portkey,
  AIMLAPI, APInex, Apixo, Command Code, provider model pages, and the major AI
  news/review sites. Which of them combine live content with immediate
  purchase? Which are closest, and what exactly is missing?
- Where is the claim only partly true? For example, a model card that links to
  inference providers, a benchmark page that links to a trial, or a review site
  with affiliate links. Name the best existing version of the idea.
- What are the closest analogs outside AI: Amazon (reviews + buy), Steam
  (reviews + buy), Wirecutter (reviews + affiliate), Tripadvisor, Goodreads,
  Bloomberg (content + terminal), Product Hunt, Rotten Tomatoes + streaming?
  What did they get right, what eroded trust, and what transfers to AI models?
- Map the current developer journey from "I heard about a model" to "I paid for
  access." Where does the user leave? What are they looking for when they leave:
  price, independent benchmark, real-world review, latency, context window,
  free trial, payment method, or reassurance about the reseller?
- What does "without leaving the site" mean in practice? Which steps can be a
  drawer/modal and which must be a page? What does a hosted checkout redirect
  cost in abandonment, and what would an embedded flow require?
- Is the gap a durable moat or a feature that OpenRouter or Hugging Face can
  copy in a quarter? What makes the combined surface defensible: proprietary
  reviews, model-linked data, community, the free allowance, or switching costs?

### B. Demand and behavior

- What evidence exists that developers consult articles, videos, papers,
  repositories, reviews or community discussions before choosing an inference
  provider or a specific model? Segment by autonomous-agent builders, indie SaaS
  developers, students/hobbyists, and engineering teams.
- Which content formats actually influence a trial or purchase: benchmarks,
  hands-on tutorials, side-by-side comparisons, release notes, demos,
  reproducible code, long-form reviews, community threads, video?
- Do developers want to buy where they read, or do they deliberately separate
  research from purchasing? What evidence exists either way?
- What trust signals matter most: author identity, methodology, sample size,
  reproducibility, recency, independence, disclosed affiliation, comments?
- What triggers a switch from one model/provider to another: price, latency,
  context window, a new release, a failed benchmark, a peer recommendation?
- What are the most common objections to buying from a reseller, and what
  content (if any) reduces them?
- How long is the consideration window, and how many touches precede a first
  top-up?

### C. Competitive teardown

Analyze at least eight AI products and four content-commerce analogs. Prioritize:

- OpenRouter model pages and provider pages (pricing, uptime, context,
  benchmarks, routing, free variants, CTAs).
- Artificial Analysis (benchmark presentation, model comparison, provenance).
- Hugging Face model cards, papers and Daily Papers (community signals,
  downloads/likes, model metadata, inference-provider links).
- LMSYS Chatbot Arena / leaderboards (ranking trust, methodology).
- Together AI, Fireworks AI, DeepInfra, Groq (model pages, pricing, docs, CTAs).
- LiteLLM and Portkey (gateway positioning, docs-as-acquisition).
- AIMLAPI / APInex / Apixo / Command Code (reseller catalogs, free tiers,
  white-label content).
- AI news and review destinations: Hacker News, r/LocalLLaMA, Latent Space,
  Simon Willison, TLDR AI, Ben's Bites, YouTube reviewers.
- Non-AI analogs: Amazon, Steam, Wirecutter, Tripadvisor, Goodreads, Bloomberg,
  Product Hunt, Rotten Tomatoes.

For each: page anatomy, content types, ranking signals, CTA path, monetization,
SEO strategy, trust devices, and weaknesses. Identify which ones already close
the content-to-purchase loop, even partially, and what their conversion
evidence is (or is not).

### D. Content-to-model linking (the hard problem)

- How should a content item be linked to a catalog model? Consider:
  deterministic aliases, regex/model-name dictionaries, provider/family
  hierarchies, version numbers, embeddings, LLM classification, and human
  review.
- What precision/recall is achievable for names like "GPT", "Claude", "Opus",
  "Sonnet", "DeepSeek", "V4.1", "Flash", "Luna", including collisions across
  families and versions? Show a realistic error taxonomy.
- What link types are useful: mention, review, benchmark, tutorial, release
  note, repository, video, paper, discussion, comparison? Should each carry a
  different weight and UI treatment?
- How should confidence be represented, and when should a link be hidden
  instead of shown? What is the review workflow for ambiguous links?
- How do you handle a model with no coverage (cold start), or coverage that is
  older than the model version?
- How do you detect and remove stale/wrong links when a model is renamed,
  deprecated or replaced?
- Could the gateway's own LLM access be used to tag content? Estimate cost,
  latency, accuracy and failure modes; is that dogfooding worth it?
- Propose a concrete schema for sources, content, model links, evidence,
  reviews, engagement and fetch cycles, with keys and indexes.

### E. Model page and shoppable content UX

- Should model pages be new `/models/[id]` routes? What is the ideal section
  order for a developer deciding whether to use a model?
- Which content modules belong on a model page (e.g. "What it is", "Price and
  access", "Independent evidence", "Benchmarks", "Reviews", "Tutorials",
  "Videos", "Repositories", "Community discussion", "Compare", "Try it")? How
  many items per module before it becomes noise?
- What does the inline model module inside an article look like? What does it
  show: live price, free allowance, context window, availability, a "get access"
  button, a link to the full model page, or all of them? Where should it sit so
  it does not interrupt reading?
- Should model names in article body text become links automatically, or only
  when an editor confirms the link? How should a link look so it reads as
  attribution, not an ad?
- What is the exact purchase path: content → model page → free key / top-up /
  plan → checkout? What can happen in a drawer or modal, and what needs a page?
- How should the CTA adapt to context: free allowance remaining, model group
  (free/paid/subscription), balance, plan status, and whether the reader is
  signed in?
- What should a logged-in customer get that an anonymous reader does not:
  saved models, followed models, price alerts, comments, usage-aware CTAs?
- How should search work across models and content? Facets by model, family,
  type, source, date?
- What are the mobile, accessibility and Core Web Vitals implications?
- Describe two or three concrete wireframes in words, not code.

### F. Reviews, ranking, quality and trust

- What mix of content is most credible for a purchase decision: aggregated
  third-party articles, original editorial reviews, structured user reviews,
  benchmark data, videos, or community discussion? What should be first-class
  and what should remain a link?
- If the site publishes original reviews, what structure is required: rating,
  pros/cons, tested use cases, methodology, sample size, reproducibility, date,
  author, disclosures?
- How should content be ranked *for a model*? Weigh relevance, source
  authority, evidence type, freshness, engagement, diversity and independence.
- How do you normalize engagement without rewarding outrage, brigading or bot
  traffic? The aggregator's current formula is engagement-heavy; is that
  appropriate for a purchase decision?
- Define an evidence hierarchy (e.g. official release notes/docs > independent
  reproducible benchmark > hands-on review with code > news > social post).
  Should the UI show the tier explicitly?
- Should there be a single "quality score" per model? If not, how do you help a
  user compare without inventing one? If yes, what inputs, weights and
  uncertainty are honest?
- How should vendor claims, sponsored content and affiliate relationships be
  labeled? What does the FTC require in the US, and what do Google's policies
  say about review snippets and scaled content?
- What is the correction/removal policy for wrong or outdated content? Who can
  edit a link?
- How should comments be moderated on a commercial site? What are the abuse,
  spam and defamation risks?

### G. Architecture and operations

Compare at least four integration architectures:

1. **Unified app and database** — content tables in the gateway's Postgres,
   content pages in the gateway, one deploy, one auth system.
2. **Content service + gateway** — aggroNATION stays separate, exposes a read
   API or shared database schema; the gateway renders modules.
3. **Content-as-data** — the aggregator writes into a `content` schema in the
   gateway database; a small internal API serves the gateway.
4. **Static/ISR dossiers** — generate model evidence pages at build/revalidate
   time and link to the gateway; minimal runtime coupling.

For each: latency, SEO, failure isolation, auth complexity, schema coupling,
deployment cost, migration cost, observability, and time to a useful version.
Recommend one, with a decision matrix.

Also answer:

- Where should ingestion run: the gateway process, a separate worker, an
  external scheduler, or GitHub Actions? How do you prevent overlapping runs,
  bound runtime, and record cycles?
- How should content be stored: plain text, sanitized HTML, extracted entities,
  embeddings? What are the sanitization and prompt-injection risks (content is
  untrusted input if an LLM tags it)?
- How do you keep content reads from affecting billing reads under load? What
  indexes, caches, timeouts and circuit breakers are needed?
- How do you render a live price/availability module inside an article without
  making the content page as slow or as fragile as a checkout page?
- What is the build-vs-buy choice for RSS/Atom parsing, full-text search,
  embeddings, moderation, media storage and checkout?
- What does the schema migration look like after the Postgres cutover, and how
  do you avoid a dual-database window?
- What is the cost at 10k, 100k and 1M content items; 1k and 10k users; and
  hourly vs daily ingestion?
- What does a rollback look like if the content feature harms latency or
  conversion?

### H. SEO and distribution

- Which pages should be indexed: model pages, content detail pages, review
  pages, tag pages, listings, comparisons? What canonical/noindex strategy
  avoids duplicate or thin content?
- What does Google's current policy say about scaled content abuse,
  AI-generated summaries, review snippets and affiliate content? What would put
  the site at risk?
- How do you make programmatic model pages genuinely useful rather than
  templated filler? What unique data can the gateway add that competitors do
  not have (live price, availability, routing, latency, free allowance,
  first-party reviews)?
- What structured data is appropriate: Product, SoftwareApplication, Review,
  FAQ, BreadcrumbList? What is ineligible or risky?
- How should internal linking work between content, model pages, reviews,
  comparisons, docs and plans?
- What role do sitemaps, RSS feeds, newsletters, YouTube, X, Reddit and
  Hacker News play? Rank by expected effort-to-traffic.
- How do you handle syndication and outbound links without leaking the
  acquisition?
- How do you measure SEO impact before the site has traffic?

### I. Monetization, funnel and attribution

- Map the full funnel: content impression → content read/watch → inline model
  module → model page → signup → key created → first API call → first top-up →
  repeat. Define "leakage" at each step and how to measure it.
- Which content types and CTAs are most likely to move a reader to a first
  call? Distinguish free-pool usage from paid conversion.
- What is the right offer at the purchase moment: free key, free allowance,
  prepaid top-up, subscription, or a plan trial? How should the CTA adapt to
  model group and user state?
- What attribution is possible without invasive tracking: UTM, first/last
  touch, server-side events, referral codes, self-reported attribution? What
  are the privacy constraints?
- Design 3–5 experiments that can run with low traffic. Include hypothesis,
  metric, sample size, duration, and guardrails. How do you avoid peeking and
  false positives?
- What are the unit economics of content: cost per item, moderation minutes,
  infra, expected conversion lift, payback? Give pessimistic/base/optimistic
  scenarios with explicit assumptions.
- Should the content hub take sponsorship or affiliate revenue? What are the
  conflicts with editorial trust and with the gateway's own resale business?
- How should the live aggregator and the original-content roadmap reinforce
  each other? Compare their conversion contribution per operator hour, not as
  substitutes.

### J. Legal, ethical and policy

- What copyright exceptions or licenses apply to RSS excerpts, full feed
  bodies, thumbnails, YouTube embeds, Reddit posts, arXiv papers and Hugging
  Face papers? What must be licensed or linked instead?
- What do the terms of service and robots.txt of each source allow? Which
  sources are unsafe to scrape or rehost?
- What DMCA/takedown, correction and source-removal process is needed?
- How should model names, logos and trademarks be used on a commercial site?
- What disclosures are required for sponsored content, affiliate links,
  benchmark claims, AI-generated summaries and first-party reviews of products
  the site sells?
- What privacy obligations arise from comments, saved items, analytics and
  cookies? Does the current no-analytics posture need to change?
- What content moderation policy is required for comments, user submissions and
  linked material (NSFW, malware, harassment, prompt injection)?
- What claims about model quality, speed or safety are defensible, and which
  would create liability?
- What checkout, PCI and consumer-protection obligations apply to selling
  prepaid credit and subscriptions?

### K. Metrics and decision rules

- Define 10–12 metrics across the gap, leakage, engagement, funnel, conversion,
  retention, SEO, trust and cost. Give exact formulas.
- What is the leakage rate today, and what is the realistic target after the
  integration? How would you measure it without a large sample?
- What are realistic pre-launch baselines, and what proxies can be measured
  before traffic exists?
- What guardrails must never regress: gateway latency, error rate, settlement
  integrity, support load, page performance?
- What thresholds justify expanding, pausing or killing the integrated surface?
- What is the single cheapest experiment that most reduces uncertainty?
- What evidence would invalidate the thesis?

## 5. Deliverables

Produce a report with these sections, in this order:

1. **Executive verdict (one page).** Is the gap real? Is the single-surface
   thesis supported? The three strongest opportunities, the three strongest
   risks, and a clear recommendation.
2. **Evidence review.** What is actually known about developer content
   consumption, model choice and content-to-purchase behavior; what is assumed;
   what is unknown. Cite sources.
3. **Current journey and leakage map.** The steps from discovery to paid access,
   where users leave, what they seek elsewhere, and the size of the opportunity.
4. **Competitive teardown.** A comparison table of at least eight AI products
   and four content-commerce analogs, with a short "what to copy / what to
   avoid" for each. State which ones already close the loop.
5. **Integration architecture.** The four options, a decision matrix, and one
   recommendation with reasoning.
6. **Content-to-model graph.** Schema, linking method, confidence tiers, review
   workflow, cold start, stale-link handling, and failure modes.
7. **Model page specification.** Sections, live price/access, content modules,
   reviews, ranking, CTAs, empty states, mobile, accessibility, and two or three
   wireframes in words.
8. **Shoppable content specification.** The inline model module, automatic vs
   editor-confirmed model links, the article-to-model-page path, the purchase
   drawer/modal vs page decision, and the exact checkout flow including any
   hosted redirect.
9. **Content hub specification.** Sources, ingestion cadence, ranking, listing
   and detail pages, search, tags, SEO, moderation.
10. **Reviews and evidence specification.** Aggregated vs original vs user
    reviews; structure, methodology, rating rules, provenance, disclosure and
    corrections.
11. **Editorial independence and trust policy.** The firewall between commerce
    and reviews, sponsorship rules, conflict-of-interest handling, and how the
    site proves it is not pay-to-play.
12. **Engagement loops.** How saves, follows, comments, reactions, digests,
    notifications and price alerts work, and what evidence justifies shipping
    each.
13. **Monetization and funnel.** CTA map, leakage metrics, attribution,
    experiment plan, unit economics with arithmetic.
14. **Legal and ethical checklist.** Copyright, terms, DMCA, trademarks,
    disclosure, privacy, moderation, claims, checkout/PCI.
15. **Delivery roadmap.** Full target scope, build vs buy, dependency order
    after the Postgres cutover, realistic time/cost, and acceptance criteria per
    milestone. Sequence dependencies; do not cut the scope.
16. **Metrics and decision rules.** Dashboard definition, guardrails, go/no-go
    thresholds, and the first experiment.
17. **Anti-patterns and rejected ideas.** Approaches that would damage trust,
    legality or conversion, with reasons. Reject on evidence, not on effort.
18. **Open questions for the operator.** Decisions only the owner can make.

## 6. Output rules

- Mark every material claim as **measured**, **assumption** or
  **recommendation**.
- Cite public sources for market data, competitor pages, platform policies,
  pricing and legal requirements. Include URLs and access dates. Do not invent
  citations.
- Distinguish correlation from causation. Flag selection bias and small-sample
  claims. Where evidence is thin, say so and give a range rather than a
  confident number.
- Show the arithmetic for every cost, conversion and payback number.
- No generic advice ("build a brand", "focus on product-market fit"). Every
  recommendation must be specific enough to execute or test this quarter.
- Prefer tables for comparisons and keep the whole report under 6,000 words.
- Explicitly answer H1, H2, H3, H4 and H5 as supported / unsupported / unknown.
- Include a short "what would change my mind" section.
- Do not recommend reducing the scope. If you recommend sequencing, sequence
  dependencies and risk, not ambition.

## Appendix A — measured fact sheet (2026-11-01)

| Item | Value |
| --- | --- |
| Gateway framework | Next.js 16.4.3, React 19.3.0, HeroUI 3.2.7, TypeScript strict |
| Gateway storage now | SQLite (`better-sqlite3` 13.0.3), WAL, one process |
| Gateway storage target | Managed Postgres; port and cutover converged, not executed |
| Gateway public pages | Landing, catalog table, compare, plans, docs, FAQ, support, legal |
| Gateway model detail page | Does not exist |
| Gateway billing | Prepaid credit, holds/settlement, free/paid/subscription groups; plans not on sale |
| Gateway payment lanes | Stripe top-ups (hosted Checkout); NOWPayments crypto (default off) |
| Gateway deployment | Not deployed; pre-launch; no live payment or paid inference |
| Gateway content subsystem | None: no content tables, parser, sanitizer, cron or admin |
| Gateway test posture (reported) | 394 unit tests, 750 HTTP checks, clean gates at 2026-10-31 |
| Aggregator framework | Next.js 16.2.6, React 19.2.6, HeroUI 3.2.4 |
| Aggregator storage | Supabase Postgres, RLS, SQL read functions |
| Aggregator sources | YouTube, RSS/Atom, Reddit, Hugging Face Daily Papers, Trendshift, Open Source Projects |
| Aggregator code size | 72 app files, 20 API routes, 30 lib modules, 31 components, ~14,900 TS/TSX lines |
| Aggregator migrations / tests | 16 SQL migrations; 9 unit-test files (pure logic only) |
| Aggregator last commit | 2026-09-05 (`f383320`); the two reviewed backups are identical in content |
| Aggregator model entity | None; content is tagged by source type and free-form tags |
| Aggregator ranking | engagement 0.6 + freshness 0.4; 14-day freshness decay; stored snapshot |
| Aggregator engagement | Comments, bookmarks, reactions, saved page |
| Aggregator readers | On-site article reader, video watch page, search, tags, rising, digest, status |
| Aggregator demo URL | `https://aggro-nation.vercel.app` per README; live status not verified |
| Operator | Independent; 25+ years of programming; has run multi-million-dollar businesses alone |
| Gateway infrastructure cost | ~USD 24/month modeled; ~USD 300 is upstream working capital, not content budget |
| Existing strategy | 12-week original technical-content roadmap for developer acquisition |
| Core thesis | No major site combines live AI content/news with immediate model purchase; verify H1 |

## Appendix B — vocabulary

- **Provider** — an upstream inference account (base URL, wire protocol,
  credential variable name). Public identity stays Savant Gateway.
- **Family** — the model line (GPT, Claude, DeepSeek, Gemini, GLM, …).
- **Group** — a billing tier: `free`, `paid` or `subscription`.
- **Plan** — an operator-authored subscription product; implemented, not sold.
- **Source** — a curated feed/channel in the aggregator (RSS, YouTube channel,
  subreddit, etc.).
- **Content item** — one article, video, paper, repository or discussion.
- **Model link** — an explicit, confidence-scored association between a content
  item and a catalog model. This does not exist yet.
- **Model module** — the inline card or block inside a content page that shows
  the linked model's live price, access and purchase action.
- **Single-surface commerce** — one origin, one account and one checkout for
  reading, evaluating and buying, with no external catalog in the path.
- **Leakage** — a user who consumes content and then leaves to buy or try the
  model somewhere else.
- **Evidence tier** — the trust level of a content item for a purchase decision
  (official docs, independent benchmark, hands-on review, news, social post).
- **Free pool** — the shared daily weighted-token allowance that lets a customer
  try models without prepaid credit.
- **Top-up** — prepaid credit purchased through Stripe or the crypto lane.
