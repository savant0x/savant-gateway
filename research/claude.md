Claude

## Role and objective You are a product, growth and commerce strategist for an independent AI infrastructure business. The operator owns two codebases and has a specific thesis to test, not a generic content-marketing question. **The thesis:** > No existing site combines a live AI conte

pasted

Searched the web, added to memory
Savant Gateway + aggroNATION: single-surface thesis review
Review date: 2026-11-01. Claims are tagged (M) measured, (A) assumption or background knowledge, (R) recommendation.

Limits of the evidence. I ran four live searches: OpenRouter model pages, Artificial Analysis, Google’s spam policies, and the FTC endorsement and reviews rules. Everything else about competitors (Hugging Face, Together, Fireworks, DeepInfra, Groq, LiteLLM, Portkey, resellers, the non-AI analogs) is background knowledge and labeled (A). I found no usable public data on developer content-to-purchase behavior, so Section B of your brief is mostly unknown. Where I give numbers, they are assumptions with arithmetic you can replace.

1. Executive verdict
The gap is real but narrow, and it is not a durable moat. Among the products I verified, none pairs a live editorial and news feed with purchase of the model being discussed. OpenRouter already closes the data-to-purchase loop on its model pages without any editorial layer. Your real gap is editorial evidence plus purchase, and OpenRouter could copy a version of it.

Hypothesis	Verdict	Basis
H1 gap is real	Partly supported	No verified site combines live editorial content with immediate purchase. OpenRouter’s model pages carry price, providers, uptime, latency, benchmarks, apps and a playground (M). Long tail unverified (A).
H2 single surface reduces leakage	Unknown	No traffic, no baseline. Plausible, untested.
H3 in-content links create qualified intent	Unknown	No evidence found either way. Cheap to test (Section 16).
H4 contextual purchase moment converts better	Unknown, plausible for price and free allowance	Mechanism is sound; no conversion data.
H5 link must be structured	Supported by design logic	The error taxonomy in Section 6 shows keyword and tag matching fails on exactly your collisions (A). Not empirically measured here.
Three strongest opportunities

/models/[id] is missing from your own product. It is the destination every link, search result and review needs, and it needs no content layer to ship.
First-party measured data. Live sell price, free-allowance state, routing availability and latency from your own traffic cannot be copied by a content site. It is empty until you have traffic, so the empty state must say so.
Your planned technical content, wired to a purchase module. Tutorials like “Cursor BYOK” or “Claude Code without an Anthropic account” are high-intent, and readers are already one step from needing a key.
Three strongest risks

Conflict of interest becomes a legal issue, not just a trust issue. The FTC’s reviews rule bars misrepresenting company-controlled review sites as independent (M, see Section 14).
Economics. At my base assumptions, content ops cost more than the margin below roughly 85k monthly visitors (arithmetic in Section 13).
Link accuracy and rehosting exposure. One wrong “Opus” link on a buy button costs more trust than ten missing links earn. Full-text rehosting of third-party material is the largest legal exposure in the aggregator.
Recommendation (R). Proceed with the full scope in dependency order. Ship /models/[id] and hand-placed model modules in your own technical posts before the content graph. This is the cheapest test of H3 and H4, and it needs no Postgres cutover. Build the aggregator layer as an excerpt-and-link-out evidence index, not a rehosting reader. That is a legal constraint on a commercial site, not a scope cut.

2. Evidence review
Topic	Status	Notes
OpenRouter model pages show price, providers, throughput, latency, uptime, benchmarks, top apps	Measured	Pages list providers, pricing, performance, uptime, benchmarks, apps and activity, with automatic failover between providers. Another model page shows 3-day uptime and lists the public apps sending the most traffic, framed as a signal of real workloads.
Independent benchmark sites exist and are used for selection	Measured	Artificial Analysis advises choosing the model first and the API provider second, since providers differ in which models they host and how they perform. It also keeps a separate provider leaderboard covering 500+ API endpoints.
Third-party aggregators already pair evals with live prices	Measured	One index site ranks models by an Artificial Analysis score next to live per-token prices. It shows price-plus-evidence is easily copied, and none of these sites sells inference.
Developers read content before choosing a provider	Assumption	Strongly intuitive, no study found.
Which formats influence trial or purchase	Unknown	Benchmarks, tutorials and comparisons are the likely candidates.
Developers want to buy where they read	Unknown	Some deliberately separate research from purchase.
Audience overlap between aggregator readers and buyers	Unknown	Brief item 10 is right to flag it.
Consideration window and touches before first top-up	Unknown	Needs your own data. 
gpt 4
 +4
Selection-bias warning (A). Developers who read AI content heavily skew toward free-tier and open-weight users. They are the least likely to pay a resale markup.

3. Current journey and leakage map
Step	Where the user goes	What they seek	Savant today
Hear about a model	X, HN, YouTube, newsletter	Hype check	Not present
Judge quality	Benchmark sites, Reddit, YouTube	Independent evidence	Not present
Check price and context	OpenRouter, provider page	Cheapest, longest context	Catalog table only
Check access	Provider page, OpenRouter	Free tier, trust in reseller	Free pool, no model page
Try it	Playground or own agent	Does it work in my tool	Docs only
Pay	OpenRouter or provider	Card, crypto, reassurance	Stripe hosted redirect
Size of the opportunity: unknown. Leakage today is unmeasurable because there is no traffic. The formula for when you have it:

Leakage rate = (readers who viewed a model module and did not create a key within 7 days) / (readers who viewed a model module)

That counts abandonment, not provably “bought elsewhere.” Add a one-question self-report at signup (“Where else did you look?”) to separate the two.

Price is the structural problem (A). A reseller marking up inference loses a pure price comparison against OpenRouter or the provider. Your wedge has to be the free allowance, one account, and routing and fallback, not price. The content hub does not change that.

4. Competitive teardown
Verification: V = checked in search this session; B = background knowledge, not re-verified.

Product	Status	Closes content→buy loop?	Copy	Avoid
OpenRouter	V	Data→buy, yes. Editorial→buy, no. Model page, providers, uptime, playground.	Per-model page anatomy, uptime and availability shown plainly, top-apps usage signal	Nothing to avoid; it is the competitor to beat
Artificial Analysis	V	No purchase path seen	Provenance, methodology page, separate model and provider boards	Single composite index presented as truth
Hugging Face	B	Partial: model cards link to inference providers; Daily Papers link papers to models	Paper→model linking, community signals	Metadata quality varies wildly
LMArena	B	No	Methodology disclosure for human-preference ranking	Rank trust erodes when vendors tune for it
Together AI	B	Pages sell directly, little independent content	Model page with price and quick start	Vendor-only evidence
Fireworks AI	B	Same as Together	Model library with clear CTA	Same
DeepInfra	B	Same; price-led	Price-first tables	Thin pages
Groq	B	Same; speed-led	Speed as the single lead claim	Claims without methodology
LiteLLM / Portkey	B	No models sold; docs-as-acquisition	Integration docs that rank for tool-specific queries	Positioning that stays abstract
AIMLAPI-type resellers	B	Catalog and free tiers, templated content	Free tier clarity	Templated filler pages (Google risk)
AI news (HN, LocalLLaMA, Latent Space, Willison, TLDR)	B	No	Reproducible hands-on posts earn trust	N/A; these are sources
Amazon	B	Yes, reviews plus buy	Review next to buy	Fake-review erosion, the reason the FTC rule exists
Steam	B	Yes, reviews plus buy	Aggregate recent vs all-time review split	Review-bombing, no independence signal
Wirecutter	B	Affiliate, partial	Published testing methodology, documented editorial separation	Affiliate incentive can still bias picks
Bloomberg	B	Content plus terminal	Content as retention for a paid tool	High production cost
Rotten Tomatoes	B	Partial, “where to watch” links	Aggregate plus source attribution	Opaque score weighting
Who closes the loop: Amazon and Steam fully (non-AI). In AI, OpenRouter closes it with data but not editorial; the others are one-sided. The best existing version of your idea is an OpenRouter model page plus an Artificial Analysis evidence section, which no one has stitched together.

Durability (A). OpenRouter already has Rankings, Benchmarks, Apps, Collections and a blog (M, from page navigation). Adding editorial links is a quarter of work for them. Your defensible assets are first-party reviews with reproducible methodology, data only a reseller sees, and the free allowance. Content aggregation alone is not defensible.

5. Integration architecture
1. Unified app+DB	2. Separate service	3. Content schema in gateway DB	4. Static/ISR dossiers
Latency	Good	Extra hop	Good	Best
SEO	Best (one origin)	Weaker (subdomain risk)	Best	Best
Failure isolation	Weak unless engineered	Best	Medium	Best
Auth complexity	One system	Two auth systems	One	One
Schema coupling	High	Low	Medium	Low
Deploy cost	Low	+$20–40/mo (A)	Low	Low
Migration cost	Medium	Low now, high later	Medium	Low
Observability	Mixed with billing	Separate	Mixed	Build logs
Time to useful version	Medium	Fastest	Medium	Fast, but not live
Recommendation (R): Option 3 with Option 1’s single app, plus an out-of-process worker.

One Next.js app and one origin, so SEO and the one-account requirement are satisfied.
A separate Postgres schema (content) with its own database role, its own connection pool, statement_timeout of 800 ms, and read-only access from the gateway app. Billing tables are never joined to content tables.
Ingestion runs outside the gateway process: a scheduled worker with an advisory lock, a hard runtime cap (e.g. 4 min), and a fetch_cycle row per run.
Article pages are ISR-cached. The live price module is a small client island fetching a cached GET /api/model-card/[id] (30 s TTL, 300 ms timeout). If it fails, the article renders with a static “see model page” link.
A feature flag CONTENT_ENABLED is checked at the route layer. Rollback means flipping it; content tables stay inert.
Why not Option 2 (R): two auth systems and cross-origin purchase break “one account,” and the aggregator’s Supabase/RLS model does not map onto the gateway’s session model. Why not 4 alone: static pages cannot show live availability, which is the unique asset.

Ingestion location (R). GitHub Actions is fine for hourly pulls at the start. At 3 min × 730 runs = 2,190 min/month it exceeds the 2,000-minute free allowance on private repos (A). Move to a small worker or daily cadence for slow sources.

Postgres sequencing (R). Hold all content migrations until the gateway cutover completes. Meanwhile ship /models/[id] (no new tables) and hand-placed modules (static config in code or one gateway table).

6. Content-to-model graph
Linking method (R), layered
Structured sources first. Hugging Face papers link to model repos, GitHub repos have model names, and YouTube titles are short. These give near-deterministic links.
Alias dictionary. For each catalog model: canonical id, family, version, size variant, and aliases (“Opus 5.5”, “claude-opus-5.5”). Matching is version-aware with word boundaries and negative contexts.
LLM disambiguation limited to candidates. The model picks only from the candidate list produced by steps 1 and 2 and returns JSON constrained to those ids. It cannot invent a model.
Human review for the middle confidence band.
Error taxonomy (A)
Error	Example	Mitigation
Family collision	“GPT-style” as a generic term	Require version or size token for auto-link
Version drift	V4 article attached to V4.1	Version scope on every link; never inherit
Variant confusion	Flash vs Pro	Variant must match exactly
Homonym	“Luna” as a model vs a name	Context window words; reject if no model-context terms
Comparative subject	“A beats B”	Subject detection; link both as comparison
Rumor or unreleased	Pre-release leak	Link type rumor, never shown on buy module
Fine-tunes	Open-weight derivatives	Separate entity; do not attach to base
Achievable accuracy (A, unmeasured). I’d expect 97–99% precision on auto-linked items and 70–85% recall on structured plus dictionary matching. Build a labeled set of 300 items first and measure before trusting these.

Link types and weights
Type	UI	Base weight
Release note / official doc	“Official” badge	1.0
Benchmark	Evidence card	0.9
Review (hands-on with code)	Review card	0.8
Tutorial	Tutorial card	0.7
Comparison	Compare module	0.7
Paper / repository	Paper / repo row	0.6
News / video / discussion	Plain link	0.4
Mention	Not shown on model page	0.1
Confidence and visibility
Confidence	Action
≥ 0.90 and structured or exact-alias	Show; text link in article
0.60–0.90	Hidden; enters review queue
< 0.60	Discard; logged for dictionary improvement
Editor-confirmed	Show regardless of score; record reviewer
Review queue SLA: 24 h. At 3,000 items/month with roughly 20% in the middle band, that is 600 reviews × 20 s ≈ 3.3 h/month (A).

Cold start, staleness, renames
Cold start: an empty module says “No independent evidence yet” with a link to the vendor’s official page. No filler.
Staleness: each link carries model_version_scope. When a newer version of the same family ships, older evidence is down-ranked and labeled “about v4.0,” not deleted.
Rename/deprecation: model_ref has a stable internal id separate from the gateway’s public id. A renamed model keeps its links; a deprecated one keeps its page with a redirect banner. A nightly job flags links whose model is gone.
Dogfooding with your own gateway (arithmetic, A)
Per item: 1,500 input + 150 output tokens at the cheapest scored model’s list price in one aggregator’s table (GPT-5.6 Luna at $0.20/M input and $1.20/M output). 
anotherwrapper

Cost = 1,500 × 0.20/1e6 + 150 × 1.20/1e6 = $0.0003 + $0.00018 = $0.00048/item
3,000 items/month = $1.44/month; 100k items = $48
Cost is trivial. The real risks are prompt injection (content is untrusted: wrap in delimiters, constrain output to candidate ids, never execute) and billing integrity. Use a separate internal credential path that bypasses customer holds and the ledger, and cap its spend with its own budget.

Schema (R), content schema
Table	Key	Notable columns	Indexes
source	id	type, url, cadence, failure_count, tos_class (link_only/excerpt/licensed)	(type, enabled)
item	id = {type}_{externalId}	source_id, title, excerpt, canonical_url, published_at, lang, tsv	GIN(tsv), (source_id, published_at DESC)
item_body	item_id	sanitized_html, license, stored_reason (only if licensed)	PK
fetch_cycle	id	source_id, started, ended, status, items_new, error	(source_id, started DESC)
model_ref	id	gateway_model_id, family, version, variant, released_at, status	unique(gateway_model_id)
model_alias	(model_ref_id, alias)	kind, negative_context	alias index (lowercased)
model_link	(item_id, model_ref_id, link_type)	confidence, method, status, version_scope, reviewed_by, reviewed_at	(model_ref_id, status, confidence DESC)
evidence	id	item_id or review_id, tier, claim_text, data_ref, measured_at	(model_ref_id, tier)
review	id	model_ref_id, author, protocol_version, rating_json, disclosures, published_at	(model_ref_id, published_at DESC)
correction	id	target_type, target_id, text, public_at	(target_id)
engagement	(user_id, kind, target)	bookmark/follow/reaction; counts kept out of ranking	(user_id, kind)
comment	id	target, user_id, status, flags	(target, created_at)
Embeddings (pgvector) are optional, at 768 dimensions, used only for candidate recall.

7. Model page specification (/models/[id])
Section order (R): (1) What it is, one paragraph from the vendor’s own description; (2) Price and access, live; (3) Try it; (4) Independent evidence; (5) Hands-on reviews; (6) Tutorials; (7) Compare; (8) Repos, papers and discussion (collapsed). Each content module shows 3–5 items with “see all.” Beyond about 5 it becomes noise (A).

Price and access module: sell price per 1M input and output, context window, group badge (free/paid/subscription), free-pool remaining for today, last verified availability, and one primary CTA chosen by state.

CTA state table (R)

State	Primary CTA	Secondary
Signed out, free group	“Get a free key”	Docs
Signed out, paid group	“Create account, try free pool” (if the model permits)	Pricing
Signed in, no key	“Create key”	Free pool status
Signed in, free pool exhausted	“Add credit”	Cheaper alternative link
Signed in, balance low	“Top up”	Usage summary
Subscription group, no plan	“See plans” (hidden while PLAN_SALES_ENABLED is off; no placeholder)	n/a
Empty states (R): no reviews: “We haven’t tested this model yet.” No measured latency: “Not enough traffic to publish a measurement.” Never fill with vendor claims presented as measurements.

Mobile and accessibility (R): price module sticky at the bottom on mobile; all modules server-rendered; the live island is non-blocking (LCP target under 2.5 s, CLS 0 by reserving height); tier badges have text, not color alone; keyboard-operable drawer with focus trap.

Wireframe A: reader-intent page (words). Top: model name, family chip, group badge. Directly below: a card with two prices, a “context 400K” fact, “Free allowance: 62% left today,” and a single button. Below: “Independent evidence” with a tier badge on each row and dates visible. Reviews follow, then tutorials. A right rail (desktop) repeats the CTA and a “Compare with…” selector.

Wireframe B: article with inline module. After the second section, a slim card: model name, price line, availability dot, “View model” link and a context-aware button. Disclosure line beneath in small text: “Savant Gateway sells access to this model and earns margin when you buy here.”

Wireframe C: comparison. Two columns, facts only (price, context, measured latency if available, evidence count per tier), one verdict line only when a published review protocol supports it.

8. Shoppable content specification
Inline module: shows model name, live price, context window, availability, free allowance and a state-aware CTA, with a link to the full page. It sits after the section where the model is first discussed, never mid-paragraph, and is collapsible. It appears once per model per article.

Auto vs editor-confirmed links (R): body-text links only at confidence ≥ 0.90 from structured or exact-alias matches, or editor-confirmed. They look like a dotted underline with a small model glyph on hover, not a button, so they read as attribution. No auto-link in headlines.

Purchase path (R)

Article → inline module → “Get access.”
Drawer (same origin): signup or login, key creation, and a first test call on the free pool. All of this stays on-page.
Top-up: amount chooser in the drawer.
Payment, step by step below.
Return to the exact article scroll position, with the key and balance shown.
Checkout, honestly: Stripe Checkout (hosted) leaves your origin and returns, typically within a minute. What matters is context preservation: store return_to and the model id server-side keyed to the checkout session, and restore them on return. Do not put them in a URL parameter.

Option	PCI scope (A)	Eng. cost	Effect on trust and conversion
Hosted Checkout (today)	Lowest	0	Redirect friction, but users recognize Stripe
Embedded Checkout (iframe)	Still low (SAQ A, A)	Medium	Removes the redirect; same Stripe UI
Payment Element	SAQ A for Stripe-hosted fields (A)	Higher	Most control, highest UI cost
Crypto invoice (NOWPayments)	Not card scope	Existing	Page-level; keep as a page, not a drawer
Recommendation (R): ship hosted Checkout with context-restoring return first; move to embedded Checkout once there are enough top-up attempts to measure drop-off. Do not claim a conversion benefit in advance: I found no evidence either way, so it is unknown. Verify the PCI classification with Stripe’s current documentation before building.

9. Content hub specification
Sources: your six types, with a tos_class per source (Section 14). YouTube via the official embed and metadata; Reddit as title and link only (see legal); RSS as excerpt plus link; papers as abstract link; repos as GitHub facts.
Cadence: hourly for fast sources (RSS, YouTube); daily for Trendshift and Open Source Projects. Per-source circuit breaker as in your existing design, with overlap prevented by an advisory lock.
Ranking in the hub: keep a freshness-driven home feed, but do not reuse the engagement formula for purchase-relevant surfaces (Section 10).
Pages: listings by source type, /content/[id] detail with excerpt, link-out, model links, and the model module; /search across models and content (Postgres FTS, facets by model, family, type, source, date); tag pages only above a minimum item threshold.
On-site reading: original content only, plus items with a recorded license. This replaces the aggregator’s “no-exit” law for third-party content.
Moderation: comments start after sign-in only, with rate limits, a report button and a hold queue for links.
10. Reviews and evidence specification
Type	First-class?	Rule
Aggregated third-party articles	Link and excerpt	Never rehosted
Original editorial reviews	Yes	Protocol-bound (below)
Benchmarks	Link plus own measurements	Cite provenance and date; use third-party numbers only per their terms
User reviews	Later, gated	Verified-usage only; see FTC constraints
Videos, community threads	Link	Evidence tier T5
Review structure (R): model and version, date tested, tested use cases, protocol version, sample size, reproducible code or prompts in a public repo, per-use-case rating (not one score), pros and cons, author and disclosures, and a changelog.

Evidence tiers (R), shown explicitly in the UI: T1 official docs and release notes; T2 independent reproducible benchmark; T3 hands-on review with code; T4 news and analysis; T5 social and discussion.

Single quality score: no (R). Any weighting is an editorial opinion you would have to defend, and a first-party score on products you sell is the highest-risk object on the site. Show per-dimension facts and let users sort by one dimension at a time.

Ranking for a model (R):

rank = confidence × (0.35·tier + 0.25·version-relative recency + 0.20·source authority + 0.10·engagement percentile within source + 0.10·diversity)

Recency is measured relative to the model’s release date, not the aggregator’s 14-day decay. Items before the release are excluded for that version. Engagement is a within-source percentile with a hard 10% weight cap and bot filtering, because the current formula divides by views, ignores RSS and Reddit entirely, and rewards outrage.

Corrections: every item and review has a public “report an error” path. Link edits require a named editor and are logged. Corrections appear on the item with a date.

11. Editorial independence and trust policy
The site sells the models it reviews. The FTC’s reviews rule explicitly targets company-controlled review websites, and the rule took effect on October 21, 2024. So the policy below is a legal control, not branding. 
bclplaw
everything-pr

Control	Rule
Firewall	Review authors cannot see margin, sell price changes, or sales data. Pricing and catalog staff cannot edit reviews. With a one-person operation, enforce this in the system: separate admin roles, a review table the catalog admin cannot write, and a public edit log.
Coverage independence	Models you do not sell are reviewed on the same protocol. If a reviewed model is not on the gateway, the module says so and links to the vendor’s official page. No affiliate links.
Disclosure	Every module and review carries a line stating you sell access and earn margin. It is next to the CTA, not in a footer.
Methodology	One public page per review protocol, versioned; raw runs and prompts in a public repo.
Sponsorship	No vendor-paid reviews. Any sponsored post is labeled, excluded from rankings and from evidence tiers.
Corrections	Public log; material errors corrected within 72 h and noted on the page.
No pay-to-play proof	Publish a standing statement that scores cannot be bought, and show the correction log and edit history as evidence.
12. Engagement loops
Feature	Ship order	Evidence justifying it	Condition
Bookmarks / saved models	1	Unknown; low cost	Instrument return visits
Follow model → email on new version or price change	1	Directly tied to purchase triggers (A)	Opt-in, one-click unsubscribe
Weekly digest	2	Unknown	Measure open and click rates before expanding
Price alerts	2	Plausible; price is a stated switch trigger	Alerts reflect your sell price only
Reactions	3	None	Never feed ranking
Comments	3	None	Only after moderation tooling and a defamation policy exist
Push notifications	4	None	Defer until email shows demand
This is sequencing by dependency (moderation tooling, email infrastructure), not scope reduction.

13. Monetization and funnel
Funnel: impression → read/watch → module view → model page → signup → key created → first API call → first top-up → repeat. Define leakage at each step as the loss from the previous step. Track server-side events (first-party, no third-party pixels).

Attribution (R): UTM and a first-touch cookie-free server session id; last touch recorded at signup; one optional self-report field. Hash IPs. No cross-site tracking. Cookie banner is probably unnecessary if you stay strictly first-party and anonymous (A, confirm for your jurisdictions).

Unit economics (A, every input is an assumption)
Shared assumptions: lifetime GMV = 3× first top-up; build cost 600 h × $100/h = $60,000; added infra $22/month; content ops 15 h/month × $100 = $1,500.

Pessimistic	Base	Optimistic
Monthly visitors	5,000	30,000	150,000
Visitor→signup	1.0%	1.5%	2.5%
Signups	50	450	3,750
Signup→top-up	8%	10%	12%
New payers	4	45	450
First top-up	$15	$20	$25
First-month GMV	$60	$900	$11,250
Lifetime GMV (×3)	$180	$2,700	$33,750
Gross margin on resale	15%	20%	25%
Monthly cohort margin	$27	$540	$8,437
Net after infra and ops ($1,522)	−$1,495	−$982	+$6,915
Payback of $60k build	never	never	≈ 8.7 months
Break-even traffic (base rates): $1,522 / $540 per 30,000 visitors → ≈ 84,600 visitors/month before any build payback.

What this means (R): the integrated surface only pays on direct margin if content traffic reaches roughly 85k/month at base conversion. Below that, the case rests on indirect value: free-pool users who convert later, the technical content roadmap’s retention, and lower acquisition cost than paid channels. None of that is measured. This is why the first experiment must come before the large build.

Sponsorship and affiliate (R): reject vendor sponsorship of reviews. Affiliate links to vendors for models you do not sell would reintroduce an incentive to route users away; skip them in the first year. Revenue from sponsored non-review slots (newsletter) is tolerable if labeled and kept off model pages.

Reinforcement between aggregator and original roadmap (R): original posts are the T3 evidence tier the aggregator cannot supply; the aggregator supplies T4–T5 breadth and freshness. Compare them by first calls per operator hour: the roadmap’s twelve posts at roughly 8–12 h each versus aggregator upkeep at roughly 8 h/month. I expect original posts to dominate conversion per hour (A); the aggregator’s value is keeping model pages from looking empty.

Experiments (low-traffic design)
Sample size for a two-proportion test, 80% power, α = 0.05: n per arm ≈ 16 × p̄(1−p̄) / δ². For 2% → 4%: p̄ = 0.03, so 16 × 0.0291 / 0.0004 ≈ 1,164 per arm, about 2,330 visitors total. At 500 visitors/week that is ~5 weeks. Fix the horizon in advance; no peeking.

#	Hypothesis	Metric	Guardrail
E1	Inline module vs none in tutorials raises key creation	Module view → key created	Page speed unchanged
E2	State-aware CTA beats generic “Sign up”	CTA click → key	No increase in support tickets
E3	Module after section 2 beats end-of-article placement	Module click-through	Scroll depth
E4	Embedded Checkout beats hosted redirect	Top-up start → paid	Failed payments, refund rate
E5	Visible evidence tier labels raise return visits	14-day return rate	Complaint count
E4 will not reach significance at pre-launch volumes; treat it as directional.

Scale costs (A)
Scale	Storage (≈12 KB/item incl. vector and index)	Embeddings (400 tok × $0.02/M ≈ $0.000008/item)	LLM tagging (all items at $0.00048)	Notes
10k items	120 MB	$0.08	$4.80	No infra change
100k items	1.2 GB	$0.80	$48	Possibly +$15–25/month compute
1M items	12 GB	$8	$480 (≈$144 with alias prefilter)	+$40–100/month for index RAM
Users: 1k vs 10k users adds mainly email (10k × 4 emails = 40k/month ≈ $4–20, A) and a few connections, since content reads are cached. Hourly vs daily ingestion changes worker minutes (2,190 vs 90 per month at 3 min/run), not storage.

14. Legal and ethical checklist
I verified only the FTC and Google rows this session; the rest is background knowledge to confirm with counsel.

Area	Position
Copyright, RSS	Feed content is not a license to republish. Excerpt of 1–2 sentences plus link is the defensible default; full text only with a recorded license. (A)
Thumbnails	Hotlink or use official embed thumbnails only where the platform terms allow; otherwise omit. (A)
YouTube	Use the official embed and API within its terms; no downloading or re-streaming. (A)
Reddit	Commercial reuse is restricted; store title and link only until you have read the current API terms. (A, verify)
arXiv / Hugging Face papers	Link to abstract pages; license varies per paper. (A)
Scrapers	Trendshift scraper must obey robots.txt; if terms prohibit it, drop the source. (A)
DMCA	Register a designated agent, publish a takedown address and a 24-hour response process, keep a counter-notice path. (A)
Trademarks	Use model names nominatively; do not use vendor logos as implied endorsement. (A)
Affiliate / material connection	The 2023 Endorsement Guides treat affiliate links as a material connection needing clear and conspicuous disclosure.
Fake or controlled reviews	The FTC rule covers fake reviews, buying reviews, insider reviews and company-controlled review sites. User reviews must be verified-usage only and never suppressed selectively.
Google, scaled content	Google defines scaled content abuse as many pages generated mainly to manipulate rankings rather than help users, whether by automation, humans or both. Programmatic model pages need unique data to be safe.
AI-generated summaries	Disclose when a summary is machine-generated; do not present it as a review. (R)
Claims	Defensible: your own measured price, latency, availability with date and method. Risky: “best,” “fastest,” “safe,” any unreproducible quality claim. (R)
Privacy	Comments, saved items and alerts create personal data; add them to the privacy policy and deletion flow. A first-party, cookie-light analytics setup is a change from “no analytics,” so state it. (A)
Moderation	Policy for harassment, NSFW, malware links, prompt-injection payloads, and defamation of named people. (R)
Checkout / PCI / consumer protection	Hosted Checkout keeps you at the lowest PCI tier; prepaid credit and refunds need clear terms (you already have /refunds); confirm money-transmitter and sales-tax treatment of prepaid credit with a professional. (A) 
FTC Releases Updated Endorsement Guides: 10 Key Takeaways
 +2
15. Delivery roadmap
Dependency order. Hours are engineer-hours at your pace and are assumptions; the Postgres cutover is an upstream dependency I have not sized.

#	Milestone	Depends on	Hours	Acceptance criteria
M1	/models/[id], state-aware CTA, hand-placed modules in your own posts, event logging	None (works on SQLite)	50–70	Page renders for every catalog model; no content tables; CTA states pass HTTP checks; billing latency unchanged
M0	Postgres cutover	Existing plan	not estimated	Executed, no dual-DB window
M2	content schema, worker, fetch cycles, flags, role isolation	M0	80–120	Content outage test: kill the worker and DB role, gateway admission and settlement unaffected
M3	Linking engine, alias dictionary, review queue	M2	80–110	300-item labeled set: ≥ 97% precision on shown links
M4	Hub pages, search, excerpt reader, tags	M2	80–120	Lighthouse LCP < 2.5 s; no rehosted third-party text without a license record
M5	Inline modules, drawer purchase, return-context restore	M1, M3	50–80	Full path tested end to end, including Stripe return
M6	Review system, protocol pages, firewall roles, corrections	M2	60–90	Catalog admin cannot write review rows; correction log public
M7	Follows, bookmarks, alerts, digest	M2, email	50–70	Unsubscribe works in one click
M8	SEO, structured data, analytics, experiments	M4, M5	40–60	Sitemaps, canonicals, thin-page noindex rules verified
M9	Legal ops, moderation tooling, comments	M4	30–50	DMCA agent filed, moderation queue live
Total ≈ 520–770 hours. At 30 build hours/week that is roughly 17–26 weeks; at 50, 10–15 weeks. Build vs buy (R): Postgres FTS over Algolia; fast-xml-parser or rss-parser over writing a parser; a maintained sanitizer such as DOMPurify via jsdom or sanitize-html over hand-rolled; pgvector over a vector service; Stripe’s embedded Checkout over a custom form. Each dependency saves more than a week and adds a single package to audit. Keep modules under the 400-line ceiling by splitting link/, ingest/, rank/ and review/ directories.

16. Metrics and decision rules
#	Metric	Formula
1	Module reach	Module views / content page views
2	Module CTR	Module clicks / module views
3	Leakage (proxy)	1 − keys created within 7 days / module viewers
4	Model-page→signup	Signups attributed to a model page / model page visitors
5	Signup→first call	Keys with ≥ 1 call within 7 days / signups
6	First call→top-up	Top-ups within 30 days / first-call users
7	Repeat rate	Second top-up within 60 days / first top-ups
8	Link precision	Confirmed correct links / audited shown links (monthly sample of 100)
9	Search value	Organic sessions to model and original pages / total sessions
10	Trust	Correction count per 100 items; share of items with tier label
11	Content cost	Ops hours + infra + LLM spend per month
12	Cost per first call	Content cost / first-call users attributed to content
Guardrails that must never regress: gateway p95 latency, error rate, settlement reconciliation differences (must be 0), support tickets per 100 users, content-page LCP.

Thresholds (R):

Expand if over 8 weeks of ≥ 2,300 visitors: module CTR ≥ 4%, signup→first call ≥ 40%, link precision ≥ 97%, cost per first call below your target.
Pause if precision < 95% or any guardrail regresses for two consecutive weeks.
Kill the integrated surface if after 12 weeks and ≥ 5,000 visitors, content-attributed first calls are within noise of non-content traffic, and the first experiment shows no lift.
Cheapest experiment (R): ship M1, put real price modules in the first 4 posts of your 12-week roadmap, and compare key creation for module vs no-module posts (page-level randomization). It needs no content schema and answers H3, H4 and overlap in about five weeks at 500 visitors/week.

Evidence that would invalidate the thesis: modules get views but near-zero clicks; readers sign up from content but never call; or users who read content convert at no higher rate than direct visitors.

17. Anti-patterns and rejected ideas
Idea	Why rejected
Auto-link every model name at any confidence	One wrong buy link outweighs many right ones; H5
Single “Savant score” per model	First-party score on products you sell is the highest-risk claim object
Rehosting full third-party articles and Reddit threads	Highest legal exposure, no purchase benefit
Mock or synthetic reviews to fill empty pages	Violates your no-fake-data rule and the FTC rule
Hiding models you don’t sell	Destroys credibility; link to vendor instead
Using the aggregator’s engagement formula for purchase ranking	Rewards outrage and ignores RSS/Reddit
Thousands of templated model-comparison pages	Scaled content abuse risk
Review or AggregateRating markup on products you sell	High risk of ineligibility or action (A, verify)
Third-party tracking pixels	Contradicts your privacy posture
LLM content tagging on the customer billing path	Violates the billing-integrity constraint
18. Open questions for the operator
Will you accept “link to the vendor when you don’t sell the model,” knowing it leaks some readers?
Is a published editorial firewall, enforced in admin roles, acceptable for a one-person operation?
What is your actual hourly opportunity cost? Section 13 turns on it.
Which jurisdictions will you sell in (sales tax, VAT, prepaid credit rules)?
Do you want comments at all, given the moderation load?
What is your target markup? Section 13’s margin assumption of 15–25% is mine.
Will you accept ending the aggregator’s “no-exit” law for third-party content?
When is the Postgres cutover date? It gates M2 onward.
What would change my mind
Toward a stronger yes: evidence that readers who see a module with live price convert at ≥ 2× the rate of those who don’t, or a sample showing most of your readers are paying API users rather than hobbyists.
Toward no: the first experiment shows no lift, or content-attributed users are almost all free-pool-only.
Alternative use of the content assets if the thesis fails: a free, no-checkout model-evidence index (excerpt and link-out) used purely as an SEO and newsletter acquisition surface for the existing gateway, with the technical content roadmap as its core. That is a different product, not a reduced version of this one.
Sources (accessed 2026-11-01)
OpenRouter, model pages: https://openrouter.ai/openai/chat-latest, https://openrouter.ai/models/openai/gpt-4, https://openrouter.ai/z-ai/glm-5.3
Artificial Analysis guide: https://artificialanalysis.ai/guide
Artificial Analysis overview (secondary): https://www.aiwiki.ai/wiki/artificial-analysis
Evals-plus-price index (third-party): https://anotherwrapper.com/tools/llm-pricing/evals/artificial-analysis
Google Search Central, spam policies: https://developers.google.com/search/blog/2024/03/core-update-spam-policies
FTC reviews and endorsements guidance: https://www.ftc.gov/reviews
FTC rule commentary: https://everything-pr.com/ftc-affiliate-disclosure-rules, https://www.infolawgroup.com/insights/2023/7/31/ftc-releases-updated-endorsement-guides-10-key-takeaways, https://bclplaw.com/print/v2/content/1547368/part-3-what-the-ftcs-final-rule-means-for-incentivized-reviews.pdf
Everything marked (A) above, including competitor rows other than OpenRouter and Artificial Analysis, platform terms (Reddit, YouTube, arXiv), PCI classification and tax treatment, should be re-verified before you commit.

I can put this into a Doc you can edit and share, or build a cost model spreadsheet where you can swap in your own assumptions.

my prices are around 75-95%cheaper than openrouter.

Added to memory aggronation.md
That changes the analysis in some places and raises a hard question in others.

What it changes
Price becomes the wedge. In Section 3 I assumed a reseller loses on price to OpenRouter, so the case had to rest on the free allowance and a single account. If your prices are 75-95% lower, the reverse holds. H4 gets stronger: a live price comparison at the point of reading is the most persuasive module you could show. Readers can see the gap and act without researching further.

The trust objection becomes the main barrier. A price that far below the incumbent makes a skeptical developer ask whether it’s the real model, whether it’s quantized, and whether the service will still exist next month. Content that answers those questions matters more than breadth:

Reproducible model-identity and fingerprint tests that anyone can run.
Public uptime and latency numbers.
A written statement of what is served and from where.
This is better material for the 12-week roadmap than generic comparisons.

The cheapest experiment gets sharper. Put a “same model, list price vs Savant” module in the first four posts. Use both OpenRouter’s list price and its effective price. Its pages show an average-paid figure that is often below list because of caching and discounts (M, from the page text I retrieved).

The hard question
My unit economics assumed a 15-25% gross margin. That number was a guess, and your pricing makes it the most important unknown in the report. OpenRouter generally passes through provider prices (A, unverified here), so a sell price 75% below it implies you are buying upstream at well below public list.

At 75% off, sell price = 0.25 × OpenRouter list. If your upstream cost were near that list, margin = (0.25 − 1.0) / 0.25 = −300%.
Margin is positive only if upstream cost is below your sell price. So the discount needs a sourcing basis that is durable.
I can’t tell from here what that basis is. These are the failure modes I’d check before the content plan, since the integration amplifies whatever sits underneath it:

Upstream terms. Do the accounts or keys you resell permit resale? Consumer subscriptions, promotional credits and free tiers often don’t.
Durability. If the upstream pricing changes, does your margin go negative overnight? Credit holds protect you per request, but not against a price change.
What’s served. If a model is quantized, distilled or substituted, publicly advertising it under the original name is a deceptive-claims risk. The brief says public identity is always owned_by: "savant-gateway", which makes accurate model disclosure on /models/[id] more important, not less.
Comparative claims. “75-95% cheaper” must be true per model, dated, and reproducible. It needs a methodology page, and the comparison module should compute it live rather than state it once.
Revised assumptions
Replace my margin row with a per-model margin table: sell price, upstream cost, margin per 1M tokens. Cheaper prices should lift conversion, but they also shrink top-up size and margin per dollar. Re-run Section 13 with your real upstream costs. If blended margin is below about 10%, break-even traffic rises well above the 85k visitors/month I estimated; if it’s near 25% or more, content looks better than my base case.

If you tell me the upstream cost basis, even roughly, I can redo the economics and flag which models are safe to feature in comparison modules.

Checking the user's claim about grey market models
You’re right on both counts. You never said the sourcing was grey market. I also called these “your public claims,” and I don’t know that any of them are published. I took statements from this chat and treated them as site copy, and that overstated things.

One narrow point stands. Earlier in this chat you wrote that you don’t offer quants or grey market models, which is a statement about sourcing and not only about fingerprinting. That’s fine as shorthand here. The only place it matters is if similar wording appears on your site, docs, or marketing. If it does, it would be the one line I’d change to the fingerprinting claim, because the fingerprint check proves output identity and not the origin of access. If it’s never been published, there’s nothing to fix.

Nothing else in the plan changes. Your verified-identity claim is the one that carries weight, and everything the content hub says about trust should stay anchored to it.

we have a benchmark system that shares the fingerprinting results on the model page

Added to memory aggronation.md
That moves the plan forward. The identity module I proposed for /models/[id] already exists in some form, so the trust layer is built before the content layer. Your brief listed no per-model detail page, so I’m assuming this is newer than the brief or lives on the catalog or compare surfaces. Tell me if that’s wrong and I’ll correct the plan.

Four things I’d check on it, since it will anchor every content link to a model:

Label it as first-party. A benchmark you run on models you sell is useful but not independent. I’d tag it “Measured by Savant Gateway” with the method and date, and keep it out of the T2 “independent benchmark” tier in Section 10. That keeps you clear of the FTC rule on company-controlled review sites.
Keep identity separate from quality. A fingerprint pass shows the output matches the direct API. It says nothing about whether the model is good at a given task. If the same module shows both, label them separately so a pass isn’t read as a quality score.
Show real timestamps and an honest empty state. Each result should carry the last-run time, sample size, and pass rate, with “not yet verified” for any model that hasn’t run. That satisfies the no-placeholder rule and makes the claim checkable.
Link the methodology and publish the runner if you can. Reproducible results move a claim from “trust us” to evidence. This is also the best roadmap post you could write.
Because this exists already, M1 shrinks to the CTA states, live price, and free-allowance parts of the model page. The model-link graph can then attach articles to a page that already has a verifiable trust signal on it.





Claude is AI and can make mistakes. Please double-check responses.
Claude finished the response
