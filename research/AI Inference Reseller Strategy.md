# **Commercial AI Inference Gateway Strategy: Operational Architecture, Economic Defense, and Developer Acquisition**

## **Executive Strategic Blueprint**

The transition of an artificial intelligence inference reseller from a low-margin token arbitrage proxy into a durable, capital-efficient infrastructure gateway requires establishing technical defensibility, protocol fidelity, and financial safeguards1. A solo operator working with \$150 in initial working capital cannot rely on paid client acquisition, headcount-intensive support, or loss-leading price wars3. Long-term viability depends on five decisive strategic choices:

> 1. **Reposition Exclusively as Dedicated Infrastructure for Autonomous Coding Agents**: The enterprise must reject generic "cheaper token" marketplace positioning4. The gateway will optimize specifically for programmatic, high-volume terminal harnesses and IDE coding tools, specifically Cursor, Claude Code CLI, Cline, Roo Code, and Aider6. Autonomous coding loops consume between 5M and 20M tokens per single debugging task, generating predictable volume from developers who are actively seeking alternatives to consumer seat limits and prohibitive direct frontier pricing7.  
> 2. **Elevate Pricing from the 1.3x Baseline to a Differentiated 2.0x–2.5x Value Multiplier**: The current 30% markup (1.3x cost-plus) delivers an effective gross margin of only 23.08%, which is mathematically insufficient to absorb unpaid stream disconnects, network transaction fees, infrastructure overhead, and upstream rate changes9. Implementing a 2.0x to 2.5x multiplier establishes a 50.0% to 60.0% gross margin while preserving a 70% to 88% retail discount relative to direct vendor list prices from Anthropic, OpenAI, and Google8.  
> 3. **Impose Cryptographic Proof-of-Work and Subnet Clamping on the 20M Free Tier**: The upstream allocation of 20M daily weighted tokens must not be treated as an open, unauthenticated proxy endpoint2. To prevent automated scraping scripts from consuming the daily allocation within minutes, access must be gated behind an Altcha Proof-of-Work challenge, an account ceiling of 100,000 weighted tokens per day, an account concurrency clamp of 1 in-flight request, and dynamic throughput shedding when provider reserves approach 1.0M tokens2.  
> 4. **Decouple Database I/O from the Streaming Request Path via In-Memory Reservations**: The application stack (Next.js 16 App Router and better-sqlite3 on a single persistent Node.js process) cannot run synchronous disk writes during active streaming without inducing severe event-loop lag and inter-chunk jitter14. Balance reservation, admission control, and usage metering must execute atomically in memory via Node.js Map collections, while SQLite operates in Write-Ahead Logging (WAL) mode with PRAGMA synchronous \= NORMAL exclusively for periodic balance commits and audit logging16.  
> 5. **Enforce Non-Custodial Layer-2 USDC Settlement with Mandatory Pre-Flight Balance Holds**: The gateway will remain crypto-only, standardizing on direct USDC deposits on Polygon and Base19. Credit card processing will remain disabled to eliminate chargebacks, rolling reserve holds, and merchant account freezes on resold inference19. To eliminate negative wallet balances caused by mid-stream disconnections, the gateway will hold a pre-flight balance lock equal to the worst-case max\_tokens cost prior to opening the upstream streaming socket2.

## **Competitor Matrix**

Developers evaluate inference gateways across protocol reliability, streaming stability, pricing transparency, payment flexibility, and platform lock-in4. The market divides into bare-metal hyperscalers, marketplace aggregators, managed proxy wrappers, and regional payment arbitrageurs.

| Competitor | Positioning | Pricing Model | Free Tier | Strongest Differentiator | Weakest Point | Threat Level to Me |
| :---- | :---- | :---- | :---- | :---- | :---- | :---- |
| **OpenRouter**22 | Universal AI API marketplace & intelligent routing layer | Upstream list price \+ 5.5% card top-up fee (5.0% crypto fee); 5% fee on BYOK over \$25k/mo | 20 RPM, 50 req/day (expands to 1,000 req/day after \$10 lifetime top-up); 20+ free models | Massive catalog (\>600 models), fallback routing, auto-prompt optimization, deep tooling integration | 5.5% top-up fee with \$0.80 floor penalizes small deposits; no native wholesale discounts on proprietary flagships | **Critical** (The universal baseline against which developers compare all aggregators) |
| **Together AI**26 | High-performance open-source model cloud & fine-tuning | Serverless per-token billing ($0.05–$7.00/1M); dedicated GPU clusters ($1.79–$9.95/hr) | No free trial; minimum $15initialcreditdeposit($5 thereafter) | Proprietary FlashAttention / inference engine speed; complete training-to-serving pipeline | No closed-source models (no Claude, GPT-4o native); dynamic rate limits during peak hours | **Low** (Different buyer profile: enterprise OSS vs. multi-model agent users) |
| **Fireworks AI**23 | Ultra-low latency serving for OSS models & compound AI systems | Serverless per-token billing; dedicated deployments | \$1 one-time credit on signup; 100 req/min limit on evaluation tier | Exceptional TTFT and token generation speed (custom vLLM/C++ runtime); speculative decoding | Pure open-weights catalog; strict commercial focus on enterprise developers | **Low** (Does not resell frontier closed-source models) |
| **Groq**29 | Real-time LPU-powered inference acceleration | Pay-as-you-go per-token ($0.05–$0.79/1M); 50% discount on Batch API; prompt caching discounts | Generous free tier: 30 RPM, 1,000–14,400 RPD, 6k–12k TPM per model; no card required | Unrivaled generation throughput (300–500+ tokens/sec on Llama architectures) | Catalog strictly restricted to small/medium open-weight models; frequent 429 errors under cluster load | **Medium** (Draws hobbyists away with free speed, but lacks frontier reasoning models) |
| **DeepInfra**3 | Bare-metal, ultra-cheap open-source model inference | Pure per-token usage ($0.10–$0.32/1M); Priority (1.5x) and Flex (0.8x) scheduling | No free tier; \$0 minimum prepaid or threshold invoicing | Global price floor on open-source weights; bare-metal GPU rental options | Open models only; hard account ceiling of 200 concurrent requests; rudimentary UI/DX | **Low** (Competes only on open models; does not provide Claude/GPT frontier access) |
| **Novita AI**4 | Developer-focused serverless LLM, image, and sandbox cloud | Usage-based pay-as-you-go per-token with cross-model resource packages | 7 free models with 50 req/day limit; temporary \$0.50 signup credit | Integrated environment: inference, image generation, and cloud code execution sandboxes | High latency variance on shared serverless tiers; complex credits/package interface | **Medium** (Attracts budget indie developers with sandbox combinations) |
| **AIMLAPI**34 | Multi-model aggregator API gateway (1,000+ models) | Freemium model: 0% markup claims, tiered monthly SaaS subscriptions (\$49+) | 10,000 log history tier, limited daily free exploration credits | Single API integration for text, image, audio, and video models | Heavy focus on monthly SaaS subscription plans; high latency overhead on non-cached routes | **Medium** (Broad catalog, but enterprise/marketing positioning leaves budget agents unserved) |
| **Requesty**32 | Unified AI routing layer with centralized key management | Upstream provider rates \+ 5% platform fee on pay-as-you-go; 0% fee on BYOK | 11 zero-priced models with daily organization rate caps | Granular routing rules, prompt firewall, enterprise cost allocation | Lacks native token discount structures; acts solely as a management wrapper | **Medium** (Competes directly on gateway software features) |
| **Self-Hosted LiteLLM Gateways** | Open-source proxy standard deployed by internal platform teams | Free core software (MIT / Enterprise license); infrastructure cost borne by user | Dependent entirely on connected underlying upstream keys | Complete data privacy, local latency control, zero vendor margin, wide provider support | Operational burden: maintenance, failover scripting, rate-limit management, server hosting | **High** (The default choice for sophisticated technical teams) |
| **Regional Resellers (Domestic/Local Payment Gateways)** | Localized token reselling in Southeast Asia, LATAM, Eastern Europe | 1.5x–3.0x markup over raw API costs, denominated in local currency | Minimal to none; small trial credits upon phone/identity verification | Local payment rails (Pix, UPI, GCash, localized bank transfers) bypassing global credit cards | Highly vulnerable to upstream account bans; inconsistent uptime; zero protocol tooling | **High** (Direct competitor for non-US, non-card developers) |

### **Competitive Dynamics and Structural Positioning**

Inference buyers exhibit distinct purchasing behaviors based on organization size and technical maturity3. Hyperscalers like Together AI, Fireworks AI, and Groq focus primarily on open-weight inference where they control the underlying compute infrastructure, competing aggressively on throughput and latency23. They do not resell proprietary closed-source models like Claude Sonnet 3.5/Opus or GPT-4o/o127. Conversely, aggregators like OpenRouter and AIMLAPI monetize multi-provider access via top-up fees or platform take-rates rather than heavy per-token markups22.  
For a solo reseller lacking proprietary GPU clusters, attempting to compete with DeepInfra or Groq on open-model token costs is structurally unviable4. The reseller's competitive defensibility rests entirely on offering access to proprietary frontier reasoning and coding models at significant discounts relative to official vendor pricing, paired with simple integration for tools that consume massive token volumes6.

## **Three Viable Strategies**

To build an economically durable operation with \$150 in capital and a single wholesale upstream relationship, the business must establish alignment across audience, pricing model, and distribution mechanics2.

### **Strategy 1: The Autonomous Agent Fuel Station (Recommended)**

* **Target Audience**: Developers, software engineers, and technical founders operating automated coding agents (Cursor, Claude Code CLI, Cline, Roo Code, Aider) who regularly exhaust consumer subscriptions and cannot afford direct API pricing from Anthropic or OpenAI6.  
* **Acquisition Wedge**: A 60-second integration process that reduces token expenditures by up to 80% using a standard OpenAI-compatible base URL, complete with verified prompt caching and transparent telemetry1.  
* **Economics**: Retail markup established at 2.0x (yielding a 50.0% gross margin)9. Under this structure, Claude Sonnet 5.5 retails at \$0.80 per 1M tokens (compared to official Anthropic pricing of \$3.00 blended), while DeepSeek V4.1 Flash retails at \$0.12 per 1M tokens (compared to \$0.70 blended direct)8. A developer consuming 15M tokens monthly generates \$12.00 in gross merchandise volume (GMV) and \$6.00 in gross profit7.  
* **Prerequisites for Success**: High protocol fidelity, reliable Server-Sent Events (SSE) streaming, context window support up to 1M tokens, correct tool-call serialization, and consistent upstream availability1.

### **Strategy 2: The Sovereign Privacy Gateway**

* **Target Audience**: International developers, privacy-conscious engineers, and Web3 builders in regions lacking access to Stripe-supported credit cards, as well as teams requiring complete operational privacy1.  
* **Acquisition Wedge**: Instant API access funded via USDC on Polygon and Base, requiring no identity verification, no credit card records, and a verifiable zero-data-retention policy1.  
* **Economics**: Retail markup established at 2.5x to 3.0x (yielding a 60.0% to 66.7% gross margin)9. Claude Sonnet 5.5 retails at \$1.00 to \$1.20 per 1M tokens, capturing higher margins from users who prioritize frictionless global access and financial privacy8.  
* **Prerequisites for Success**: Non-custodial crypto payment verification, robust RPC event listening, automated wallet balance reconciliation, and compliance with US sanctions screening at the blockchain network layer19.

### **Strategy 3: The High-Throughput Batch Arbitrageur**

* **Target Audience**: Bootstrapped founders and data engineers running asynchronous, non-real-time batch inference: bulk web scraping, large-scale document parsing, synthetic dataset production, and offline codebase refactoring4.  
* **Acquisition Wedge**: A guaranteed 50% discount against commercial batch APIs, bundled with generous Requests Per Minute (RPM) limits funded by pooling upstream subscription tiers2.  
* **Economics**: High-volume, low-margin arbitrage operating at a 1.4x markup (28.6% gross margin)9. The reseller purchases upstream subscription tiers (\$100 per 30 days for 20B tokens, equivalent to \$0.005 per 1M tokens) and resells to downstream batch workers at \$0.02 to \$0.05 per 1M tokens9.  
* **Prerequisites for Success**: Significant upfront working capital to pre-purchase large subscription token pools, reliable background job queuing, and consistent wholesale pricing guarantees2.

### **Strategic Recommendation and Differentiation Ranking**

Strategy 1 (The Autonomous Agent Fuel Station) is the sole viable choice for launch. Strategy 3 is infeasible because the founder's \$150 in working capital cannot cover the upfront costs of multi-hundred-dollar subscription pools9. Strategy 2 carries complex regulatory considerations under US commercial guidelines and serves a smaller initial niche19. Strategy 1 addresses an immediate developer pain point: coding agents rapidly depleting token allocations6.  
To assess long-term defensibility for a solo operator reselling commodity models, potential differentiation levers rank as follows:

> 1. **Routing and Fallback Reliability (Defensibility: High / Deal Winner)**: Implementing automatic failover across internal upstream keys and secondary provider models when rate limits (HTTP 429\) occur prevents agent session crashes1.  
> 2. **Developer Experience and Integration Recipes (Defensibility: High / Deal Winner)**: Providing plug-and-play configuration files for Cursor, Claude Code, and Cline removes adoption friction6.  
> 3. **Niche Vertical Optimization (Defensibility: High / Deal Winner)**: Tailoring token allocation and system prompt caching specifically for coding agent tasks creates stickier user workflows6.  
> 4. **Verifiable Model-Integrity Telemetry (Defensibility: Moderate / Deal Winner)**: Publishing live canary probes and latency benchmarks builds buyer trust in model authenticity4.  
> 5. **Non-Custodial Crypto Payment Rails (Defensibility: Moderate / Conversion Wedge)**: Providing instant, global USDC settlement serves international developers who cannot use Stripe19.  
> 6. **Zero-Retention Privacy Posture (Defensibility: Moderate / Table Stakes)**: Operating a stateless proxy that stores zero prompt or completion payloads is necessary for developer consideration1.  
> 7. **Direct Developer Support (Defensibility: Moderate / Retention Lever)**: Direct technical support from the founder on Discord or GitHub resolves edge cases faster than large aggregators19.  
> 8. **Technical Educational Content (Defensibility: Moderate / Acquisition Wedge)**: Authoritative technical guides on agent optimization drive low-cost inbound traffic6.  
> 9. **Low-Latency Proxy Execution (Defensibility: Low / Table Stakes)**: Keeping gateway proxy overhead below 10ms is essential to avoid degrading upstream performance1.  
> 10. **Retail Pricing / Markup (Defensibility: Zero / Commodity)**: Competing purely on price leads to margin collapse as larger aggregators or upstream providers adjust their rates4.

## **Prioritized Feature Matrix**

Engineering resources must focus on features that directly safeguard against financial loss, maintain streaming fidelity, or increase developer retention2. Complex features requiring distributed orchestration are deferred in favor of reliable, in-process implementations2.

| Feature Name | Tier | Buyer Evidence / Problem Solved | Build Effort | Impact on Conversion & Retention |
| :---- | :---- | :---- | :---- | :---- |
| **In-Memory Pre-Flight Balance Lock**2 | P0 (Launch) | Prevents negative wallet balances and financial losses caused by clients aborting connections during streaming2. | Small (1–2 days) | **Critical**: Protects operating capital; eliminates uncollectible debt from abandoned streams3. |
| **Strict SSE Protocol Normalization** (stream\_options)44 | P0 (Launch) | Cursor and Cline disconnect if terminal usage chunks or \[DONE\] tokens are missing or improperly framed42. | Small (1 day) | **Critical**: Eliminates initial integration drop-off and client JSON parsing crashes42. |
| **Altcha Proof-of-Work Challenge**13 | P0 (Launch) | Free tier pools are rapidly drained by automated harvesting scripts within hours of public launch2. | Small (1 day) | **High**: Blocks automated Sybil attacks while preserving a frictionless signup flow13. |
| **Non-Custodial USDC Deposit Engine**19 | P0 (Launch) | Developers require automated, real-time balance crediting without third-party KYC checks19. | Medium (3 days) | **High**: Enables instant onboarding for crypto-native and international developers19. |
| **Provider Error Fallback & Circuit Breaker**1 | P0 (Launch) | Upstream 429 and 503 errors break autonomous agent loops, causing task failure1. | Medium (2 days) | **High**: Increases perceived reliability by catching errors and retrying on secondary keys1. |
| **Anthropic /v1/messages Translation Layer**1 | P1 (Differentiator) | Claude Code CLI and Cline default natively to Anthropic's payload schema1. | Large (5–7 days) | **High**: Expands the addressable market to developers using Anthropic-native CLI tooling6. |
| **Per-Key Spend Limits and Key Scoping**2 | P1 (Differentiator) | Engineers fear runaway billing from infinite loops in autonomous agent frameworks24. | Small (1–2 days) | **High**: Reassures users against billing surprises; standard table stakes in 20263. |
| **Public Telemetry and Uptime Dashboard**4 | P1 (Differentiator) | Resold inference services face user skepticism regarding stability and actual model speed4. | Medium (3 days) | **High**: Serves as the primary trust engine and organic acquisition asset4. |
| **Low-Balance Alert Webhooks & Emails**12 | P1 (Differentiator) | Background agent fleets halt unexpectedly when prepaid credit balances reach zero50. | Small (1 day) | **Moderate**: Accelerates user top-up frequency and prevents workflow disruption3. |
| **Automated Model Canary Integrity Scanner**43 | P2 (Later) | Buyers worry low-cost tokens indicate silent quantization (INT4/FP4) or model distillation43. | Medium (3–4 days) | **Moderate**: Differentiates the service against unverified budget resellers8. |
| **Multi-Upstream Provider Load Balancing**22 | P2 (Later) | Relying on a single wholesale upstream vendor presents operational concentration risk4. | Large (7+ days) | **Critical for Scale**: Essential for resilience once monthly volume exceeds \$2,000 GMV4. |
| **Workspace Role-Based Access and Audit Logs**19 | P2 (Later) | Engineering teams require credential separation across multiple developers and services19. | Medium (4 days) | **Moderate**: Enables higher markups on dedicated team accounts10. |

## **The 20M Token Playbook**

The wholesale provider provides an account allowance of 20M weighted tokens per day, resetting at 00:00 UTC2. Free models carry weight multipliers of x2 to x4, meaning the 20M weighted pool yields between 5M and 10M raw tokens of actual model output2. This shared pool must be operated as a controlled conversion funnel rather than an open public utility22.

### **Operational Rules of Engagement**

> 1. **Dynamic Pool Partitioning**: Allocate 90% of the daily pool (18M weighted tokens) for active user distribution2. Retain 10% (2M weighted tokens) as an operational reserve2. The gateway must immediately halt free-tier admissions whenever upstream remaining tokens drop below 1.0M to safeguard core system operations2.  
> 2. **Account Quotas and Velocity Bounds**: Cap each registered account at 100,000 weighted tokens per rolling 24-hour period (equivalent to 25,000 to 50,000 raw tokens depending on model weight)2. Restrict free-tier concurrency to 1 active connection per account, with a strict ceiling of 5 Requests Per Minute (RPM)2.  
> 3. **Sybil Resistance Architecture**:  
   * *Client-Side Proof-of-Work*: Require users to compute an Altcha challenge (SHA-256 at difficulty 100,000, requiring \~800ms of CPU compute) prior to issuing a free-tier API key13. This imposes real computational costs on automated bot farms without requiring intrusive CAPTCHAs13.  
   * *Subnet Velocity Limiting*: Restrict free key creation to 3 registrations per /24 IPv4 block or /48 IPv6 prefix per 24 hours.  
   * *Disposable Email Suppression*: Filter signups against a dynamically updated registry of disposable email domains.  
> 4. **Graceful Pool Degradation & Drain Resistance**:  
   * *Nominal State (0%–70% pool consumed)*: Standard access up to 5 RPM per account12.  
   * *Throttled State (70%–90% pool consumed)*: Reduce account rate limits to 2 RPM and clamp maximum completion tokens (max\_tokens) to 1,02412.  
   * *Exhaustion State (\>90% consumed or provider reserves \< 1M)*: Return HTTP 429 Too Many Requests with a Retry-After header pointing to 00:00 UTC, accompanied by the response header: X-Pool-State: Depleted-Upgrade-Prepaid-USDC12.

### **Mathematical Modeling Across Active User Cohorts**

The following model evaluates daily token consumption, pool duration, upstream operational costs, and the conversion performance required to achieve financial breakeven across three user volume tiers.

| Free Tier Operational Metric | 10 Active Free Users | 100 Active Free Users | 1,000 Active Free Users |
| :---- | :---- | :---- | :---- |
| **Aggregate Daily Demand (Weighted)**2 | 1,000,000 tokens | 10,000,000 tokens | 100,000,000 tokens (Uncapped) |
| **Ratio of Allocable Pool (18M)**2 | 5.5% of allocation | 55.5% of allocation | 555.5% (Severe Deficit) |
| **Time of Daily Pool Depletion** | Never (Pool holds surplus) | Never (Pool holds surplus) | \~04:15 UTC (Rapid Drain) |
| **Peak Gateway Concurrency** | 0.1–0.3 req/sec | 1.0–3.0 req/sec | 15.0–30.0 req/sec |
| **Direct Upstream Token Cost**9 | \$0.00 | \$0.00 | \$0.00 (Hard Cap) / \$1.00 (Sub Tier) |
| **Breakeven Conversion Rate**9 | 10.0% (1 paid user) | 4.0% (4 paid users) | 2.5% (25 paid users) |
| **Monthly Paid GMV Generated**7 | \$12.00 | \$48.00 | \$300.00 |
| **Net Operating Margin (Post-Hosting)**9 | \-\$3.00 (Hosting shortfall) | \+\$33.00 (Self-sustaining) | \+\$185.00 (Profitable) |

### **Free Tier Unit Economics and the Financial Inversion Point**

* **10 Active Users**: Daily demand consumes 1.0M weighted tokens (5.5% of the allocable pool)2. Direct upstream token expense is \$0.0011. However, fixed VPS hosting costs (\$15.00 per month) result in a net deficit of \$3.00 unless at least 1 user converts to a paid balance9.  
* **100 Active Users**: Daily demand reaches 10.0M weighted tokens (55.5% of allocation), fitting comfortably within the upstream free allowance without triggering throttling mechanisms2. A 4% conversion rate yields 4 paying customers consuming 15M tokens monthly at a 2.0x markup, generating \$48.00 in GMV and \$24.00 in gross profit7. After covering the \$15.00 hosting expense, the operation nets \$33.00 monthly profit9.  
* **1,000 Active Users**: Uncapped aggregate demand reaches 100M weighted tokens daily, exceeding available pool capacity by over 5x2. If unmitigated, the pool exhausts before 05:00 UTC, frustrating legitimate developers and causing integration failures53.  
* **The P\&L Inversion Point**: To maintain service continuity at 1,000 users without daily lockouts, the operator must purchase an upstream subscription package (\$30 per 30 days for 5B tokens, providing \~166M tokens daily at \$1.00 per day)9. **At this threshold, the free tier shifts from an acquisition asset to a direct cash expense of \$30.00 per month**9. To maintain profitability, the conversion rate must stay above 2.5% (25 paying customers generating \$300.00 in GMV and \$150.00 in gross margin), which covers the \$30.00 token package and \$20.00 in infrastructure costs to yield \$185.00 in net profit9.

## **Benchmark and Telemetry Specification**

To address developer skepticism regarding wholesale token reselling, the gateway will maintain a public, verifiable telemetry dashboard4.

### **Core Telemetry Implementation**

* **Isolated Monitoring Instance**: Synthetic health probes run from an independent, low-cost VPS instance (e.g., Hetzner US East, \$4/month) to evaluate proxy endpoints and upstream APIs every 5 minutes4.  
* **Standardized Probe Configurations**:  
  * *Latency Probe*: Measures HTTP handshake, connection time, and Time To First Token (TTFT) using a standardized single-token prompt ("Respond with 'OK'.", max\_tokens: 1, temperature: 0\)4.  
  * *Throughput Probe*: Measures chunk arrival regularity and sustained tokens per second using a fixed generation workload ("Count from 1 to 100.", max\_tokens: 250, temperature: 0\)4.  
  * *Reasoning Probe*: Tests pass rates on standardized code refactoring and AST analysis tasks across frontier reasoning endpoints6.  
* **Storage and Distribution Architecture**: Probe measurements are recorded in a local SQLite table, aggregated into 1-minute, 1-hour, and 24-hour summary views17. Rolling percentiles (![][image1], ![][image2], ![][image3]) are computed and exported every 60 seconds to a static JSON document (/v1/telemetry/summary.json), allowing public dashboard queries to be served without querying the operational database17.

### **Monitored Metrics and Supported Claims**

| Telemetry Metric | Sampling Interval | Empirical Measurement Definition | Verifiable Product Claim |
| :---- | :---- | :---- | :---- |
| **TTFT (![][image4])**4 | Every 300 seconds per model tier | Duration between HTTP request dispatch and receipt of the initial SSE chunk containing delta content. | "Empirical proxy-to-upstream transit latency." |
| **Streaming Jitter**4 | Every 300 seconds on 250-token streams | Standard deviation of arrival intervals across streamed response chunks within an active connection. | "Chunk streaming consistency without gateway event-loop blocking." |
| **Catalog Availability**6 | Continuous 24-hour rolling window | Proportion of HTTP 200 responses relative to total automated probe runs, excluding client-side 4xx errors. | "End-to-end service availability across upstream routes." |
| **Fallback Invocation Rate**1 | 1-hour rolling window | Percentage of production calls automatically rerouted to backup credentials or models due to upstream rate limits. | "System resilience against wholesale rate limit spikes." |
| **Standardized Task Cost**4 | Synchronized with catalog pricing | Calculated token cost to run a standardized 1,000-line codebase refactoring task at retail prices. | "Transparent developer cost savings versus official list rates." |

### **Telemetry Claim Boundaries**

* **Supported Claims**:  
  1. The proxy layer introduces minimal network overhead (measured at ![][image5] processing latency)1.  
  2. Immediate uptime, HTTP error distribution, and transient failure rates for all catalog entries6.  
  3. Verifiable cost savings per completed programming task compared to direct hyperscaler pricing4.  
* **Unsupported Claims**:  
  1. The platform *cannot* claim ownership of underlying hardware clusters, proprietary TPU/GPU accelerators, or native chip execution speeds29.  
  2. The platform *cannot* provide enterprise financial SLA guarantees regarding upstream uptime, as upstream reliability is controlled by the wholesale provider41.  
  3. The platform *cannot* provide mathematical proof of model weight integrity for closed proprietary models that omit logprob data43.

## **Architecture, Latency, and Reliability Hardening**

### **Quantifying Proxy Latency and SQLite Overhead**

Deploying an API gateway proxy on Node.js requires understanding the performance differences between interpreted JavaScript event loops and compiled systems runtimes like Go or Rust16.

| Processing Layer | Measured Execution Latency | Severity / Impact | Architectural Mitigation |
| :---- | :---- | :---- | :---- |
| **Next.js Route Handlers & Validation** | 1.5ms – 3.2ms (vs. 0.2ms in Go) | Low (Negligible) | Utilize native Next.js App Router handlers; avoid heavy authentication middleware chains. |
| **JSON Parse and Serialization** | 0.8ms – 2.5ms (100KB payload) | Low (Negligible) | Extract routing headers and stream raw request buffers upstream without parsing deep payload trees. |
| **Synchronous SQLite Disk Contention**14 | 15ms – 85ms+ (Under concurrent load) | **Critical** (Blocks event loop) | Run SQLite in WAL mode with PRAGMA synchronous \= NORMAL; handle active reservations in memory16. |
| **SSE Inter-Chunk Streaming Passthrough**1 | \<0.5ms per chunk | Low (Negligible) | Pipe upstream response chunks directly via Node.js TransformStream without array buffering. |

Upstream inference generation averages 250ms to 2,000ms for TTFT4. The \~3ms overhead introduced by Node.js is imperceptible to downstream developers4. However, **synchronous disk writes via better-sqlite3 on the active streaming path will block the single-threaded Node.js event loop**, stalling all concurrent connections and introducing noticeable streaming jitter14. To eliminate this bottleneck, database configuration must enforce:

SQL  
PRAGMA journal\_mode \= WAL;  
PRAGMA synchronous \= NORMAL;  
PRAGMA cache\_size \= \-64000;  
PRAGMA temp\_store \= MEMORY;  
PRAGMA busy\_timeout \= 5000;

(Database tuning parameters verified for high-concurrency Node.js SQLite deployments16).

### **Protocol Fidelity and SSE Streaming Edge Cases**

OpenAI SDK compatibility requires strict conformance with the Server-Sent Events (SSE) specification1. Incomplete or non-compliant SSE framing causes client SDKs to fail during execution44.

| Protocol Edge Case | Failure Manifestation | Normalization Mechanism |
| :---- | :---- | :---- |
| **Missing Terminal Packet** (\[DONE\])44 | Client connections hang open indefinitely; code execution never finishes. | Monitor stream completion; if upstream closes without emitting data: \[DONE\]\\r\\n\\r\\n, the gateway force-emits the delimiter before terminating the response44. |
| **Streaming Usage Chunk Structure**44 | Client throws parsing exceptions: TypeError: Cannot read 'delta'46. | When stream\_options: {"include\_usage": true} is present, pass through the final chunk containing an empty choices: \[\] array and populated usage object intact44. |
| **Fragmented Tool Call Serialization**44 | Client fails to parse JSON arguments; function call execution fails. | OpenAI delivers function call arguments across multiple partial text chunks; the gateway must stream each delta sequentially without buffering or re-encoding44. |
| **Reasoning / Thinking Delta Normalization**44 | Coding agent UIs fail to render output or display corrupted text. | Map vendor-specific thinking blocks (reasoning\_content from DeepSeek or o1) into standardized delta parameters or strip them based on client configuration44. |
| **Prefill Connection Dropouts** | Network firewalls close idle HTTP connections during long context prefill. | Dispatch an SSE keep-alive comment (: keep-alive\\n\\n) every 15 seconds during prefill to keep client sockets open44. |

### **Streaming Settlement, Abandonment, and Negative Balance Prevention**

A reseller operating with \$150 in capital cannot absorb losses caused by client disconnections or mid-stream overdraft exploits2.

* **The In-Memory Reservation Workflow**:  
  1. *Admission Check*: When a request arrives, the gateway computes the maximum potential financial exposure: ![][image6]. The gateway checks whether the account's available in-memory balance covers the hold2. If the balance is insufficient, the request is rejected with HTTP 402 Payment Required12.  
  2. *Active Balance Reservation*: The hold amount is deducted from available memory balance and assigned a temporary reservation\_id, after which the upstream connection is initiated2.  
  3. *In-Flight Usage Metering*: As SSE chunks pass through the gateway, an internal accumulator tracks output tokens2.  
  4. *Final Settlement*: Upon receiving the final usage chunk or stream completion, actual usage is calculated: ![][image7]2. The temporary hold is cleared, the precise amount is deducted from user balance, and the transaction is queued for batched SQLite persistence2.  
  5. *Handling Client Disconnections*: If the downstream client aborts the connection mid-stream, the gateway triggers an immediate AbortController signal to terminate the upstream socket, halting token consumption12. The account is billed for tokens received up to the abort signal plus a 10% safety margin, and unspent hold funds are credited back to the available balance2.

### **Model Verification and Anti-Quantization Auditing**

Wholesale inference markets frequently face scrutiny regarding silent model downgrades, aggressive weight quantization (e.g., serving FP4 or INT4 instead of FP8/BF16), or routing requests to smaller distilled models43. A solo operator must audit upstream delivery using empirical methods8.

| Integrity Verification Method | Target Detection Vector | Technical Precision & Boundaries | Public Disclosure Method |
| :---- | :---- | :---- | :---- |
| **Tokenizer Fingerprinting**43 | Detects wholesale model substitution (e.g., returning Llama responses for Claude requests). | **Deterministic Proof**: Token splits on specialized prompt sequences must match official vendor tokenizers identically. | "Verified tokenizer alignment across all supported model routes." |
| **Needle-in-a-Haystack (NIAH)**56 | Detects unannounced context window truncation or context cache drops. | **High Confidence**: Assesses recall accuracy across 64K to 1M token contexts to ensure advertised window capacity is respected. | "Measured context retrieval pass rate: 99.8% across full context windows." |
| **Logprob Distribution Analysis**43 | Detects aggressive model quantization (e.g., FP16 down to INT4). | **Inference Only**: Logprob analysis is constrained because commercial proprietary models do not return logprob tables. | Internal monitoring only; cannot be published as conclusive proof. |
| **Greedy Seed Canary Prompts**43 | Detects hidden system prompts, model drift, or prompt-cloaking layers. | **Moderate Confidence**: Compares generation consistency on fixed, zero-temperature prompts against known reference outputs. | "Behavioral consistency tracking within established control limits." |

To prevent supplier disputes, all public integrity findings must be presented strictly as empirical benchmark measurements (e.g., *"Benchmark Code Refactoring Pass Rate: 96.8%"*) rather than making direct claims about upstream infrastructure practices8.

## **Twelve-Week Content Roadmap**

Technical developer acquisition relies on concrete integration recipes, debugging guides, and reproducible benchmark analyses rather than high-level commentary6. Articles targeting specific setup issues and configuration needs convert developers searching for alternatives to rate limits and payment constraints6.

| Week | Planned Article Title & Focus Area | Search Intent & Query Focus | Target Converting Audience | Priority & Return Order |
| :---- | :---- | :---- | :---- | :---- |
| **W01** | "Connecting Custom OpenAI-Compatible Endpoints to Cursor: The Complete BYOK Guide"7 | Informational / Transactional (cursor custom openai base url) | Active Cursor developers seeking relief from seat pricing7. | **Immediate**: Generates initial key creations from active coding agent users7. |
| **W02** | "Running Claude Code CLI Without an Anthropic Account: Step-by-Step Setup"6 | Commercial / Technical (claude code custom endpoint base url) | Developers encountering Anthropic API card payment rejections7. | **Immediate**: Captures developers seeking alternative access to Claude Code6. |
| **W03** | "How to Slash Aider Token Spend by 80% with DeepSeek V4.1 and Sonnet Routing"7 | Commercial (aider cheap api keys deepseek sonnet) | Autonomous coding agent users managing large codebases7. | **Fast**: Converts users running high-frequency coding loops7. |
| **W04** | "Fixing Streaming JSON Parsing Errors in OpenAI-Compatible Gateway Proxies"42 | Troubleshooting / Technical (openai streaming unexpected end of json) | Full-stack developers building custom AI integrations46. | **Fast**: Positions the gateway as a reliable, production-tested proxy1. |
| **W05** | "Building Zero-Downtime Agent Fleets: Handling 429 Errors with Fallback Routing"1 | Technical Guide (llm handle 429 fallback routing agent) | Engineers managing multi-agent systems and production bots1. | **Compounding**: Attracts high-volume agent developers seeking reliable routing1. |
| **W06** | "Funding Production AI Inference with Pure USDC: Zero KYC, Instant Deployment"19 | Commercial (crypto ai inference api usdc no kyc) | Web3 developers and international software teams19. | **Compounding**: Converts international developers seeking cardless billing19. |
| **W07** | "Mastering 1M Context Windows: Latency and Cost Trade-offs Across 44 Models"6 | In-Depth Analysis (1m token context cost benchmark llm) | Enterprise RAG developers and document processing teams56. | **Compounding**: Builds domain authority for long-context workloads6. |
| **W08** | "Optimizing Cline (VS Code) for Coding: The Sub-\$5/Day Frontier Model Setup"6 | Practical Tutorial (cline vs code cheapest api configuration) | Independent programmers and open-source contributors7. | **Steady**: Drives adoption through open-source tooling ecosystems6. |
| **W09** | "DeepSeek V4.1 Flash vs. GPT-6 Luna: Which Low-Cost Model Leads on Code Refactoring?"6 | Comparative Analysis (deepseek v4.1 vs gpt 6 luna coding) | Technical leads evaluating cost-performance trade-offs8. | **Steady**: Establishes ranking authority on budget frontier models8. |
| **W10** | "Why We Replaced Stripe with Non-Custodial USDC: Insights from an Infrastructure Reseller"19 | Case Study / Editorial (stripe vs crypto payment developer saas) | Indie Hackers and open-source builder communities19. | **Viral Potential**: Drives discovery across Hacker News and X19. |
| **W11** | "Preventing Uncapped Bill Shock in Agentic Tool-Use Workflows"24 | Architectural Tutorial (llm agent prevent infinite loop cost) | Engineering managers managing API budgets50. | **Steady**: Highlights per-key spend caps and risk controls3. |
| **W12** | "Q4 Empirical Latency Report: Benchmarking TTFT Across 44 Commercial Endpoints"6 | Benchmark Industry Report (llm inference ttft benchmark report) | Senior software engineers and AI platform architects4. | **High Long-Term Return**: Creates backlink authority and industry recognition4. |

## **90-Day Execution Plan**

The execution roadmap divides into three consecutive 30-day phases, each focused on a measurable operational objective9.

### **Phase 1: Gateway Hardening, Protocol Fidelity, and Settlement Security (Weeks 1–2)**

* **Core Objective**: Ensure gateway stability under concurrent load and prevent negative balances during streaming interruptions2.  
* **Primary Target**: Achieve a 100% test completion rate across 50 concurrent streaming agent connections with zero SQLite write collisions and zero uncollected balances12.  
* **Operational Tasks**:  
  1. Initialize SQLite with Write-Ahead Logging, PRAGMA synchronous \= NORMAL, and a 64MB memory cache17.  
  2. Implement atomic in-memory Map reservations for pre-flight balance holds on incoming requests2.  
  3. Validate SSE chunk delivery to confirm compliance with stream\_options: {"include\_usage": true} and proper \[DONE\] propagation44.  
  4. Integrate the Altcha Proof-of-Work challenge onto the free key generation interface13.  
  5. Deploy the application to a dedicated VPS behind Cloudflare caching and proxy rules2.

### **Phase 2: Public Launch and Developer Wedge Acquisition (Weeks 3–4)**

* **Core Objective**: Onboard the initial paying developer cohort through targeted coding-agent channels6.  
* **Primary Target**: Acquire 50 registered developers and achieve \$100 in cumulative prepaid USDC balance deposits9.  
* **Operational Tasks**:  
  1. Publish W01 and W02 integration guides covering Cursor and Claude Code configuration6.  
  2. Share technical cost breakdowns on X/Twitter and r/Cursor focusing on autonomous agent usage7.  
  3. Launch non-custodial USDC deposit monitoring on Base and Polygon networks19.  
  4. Configure automated bot alerts to notify the operator of wallet deposits and wholesale balance changes2.  
  5. Open the 20M free allowance pool with dynamic throttling enforced below 1.0M remaining provider tokens2.

### **Phase 3: Protocol Expansion, Telemetry Dashboard, and Retention Scaling (Months 2–3)**

* **Core Objective**: Remove integration friction and drive conversion through transparent platform telemetry1.  
* **Primary Target**: Reach \$500 monthly GMV at ![][image8] gross margin while maintaining a ![][image9] free-to-paid conversion rate9.  
* **Operational Tasks**:  
  1. Implement and release the native Anthropic /v1/messages translation layer to support Claude Code CLI without wrappers1.  
  2. Deploy the public telemetry dashboard displaying real-time TTFT percentiles and service availability4.  
  3. Release per-key budget limits and automated low-balance webhooks2.  
  4. Engage with open-source communities across Aider, Cline, and Roo Code developer discussions6.  
  5. Allocate positive cash flow to fund secondary upstream provider integrations to reduce vendor concentration risk22.

## **Monetization, Payments, and Unit Economics**

### **Pricing Structures and Markup Economics**

Operating at a 30% markup (1.3x) is financially precarious for a solo reseller: it yields only 23.08% gross margin, which is easily erased by failed requests, network transaction fees, and infrastructure expenses9. A tiered value-based pricing structure protects margins while preserving a competitive retail discount8.

| Model Class & ID | Wholesale Cost / 1M | Proposed Retail (2.0x–2.5x) | Gross Margin % | Retail Savings vs. Official List |
| :---- | :---- | :---- | :---- | :---- |
| **DeepSeek V4.1 Flash**8 | \$0.060 | \$0.120 (2.0x) | 50.0% | 82.9% OFF (vs. \$0.70 blended direct) |
| **GPT-6 Luna**8 | \$0.075 | \$0.150 (2.0x) | 50.0% | 75.0% OFF (vs. \$0.60 blended direct) |
| **GPT-6.1 Sol**8 | \$0.300 | \$0.650 (2.17x) | 53.8% | 74.0% OFF (vs. \$2.50 blended direct) |
| **Claude Sonnet 5.5**8 | \$0.400 | \$0.850 (2.12x) | 52.9% | 71.7% OFF (vs. \$3.00 blended direct) |
| **Claude Opus 5.5**8 | \$0.500 | \$1.250 (2.50x) | 60.0% | 75.0% OFF (vs. \$5.00 blended direct) |

Wholesale subscription packages provide bundled RPM allocations (15 to 200 RPM) alongside token allowances11. **The gateway should pool these RPM allocations internally rather than assigning them to individual users**2. By managing this pooled capacity at the proxy layer, the gateway can multiplex concurrent requests efficiently across all paid users while maintaining standard 5 RPM limits on free accounts2.

### **Evaluating Payment Gateways and Rails**

Traditional card checkout was evaluated and set aside: standard merchant acquirers view token reselling as high-risk digital arbitrage, impose 2.9% \+ \$0.30 processing fees (eroding small \$5 deposits), maintain 10% rolling capital reserves, and expose solo operators to payment disputes and chargebacks19.

| Payment Option | Processing Fees | Custody Architecture | Chargeback Liability | Solo Operational Load |
| :---- | :---- | :---- | :---- | :---- |
| **Stripe (Rejected Alternative)**22 | 2.9% \+ \$0.30 (8.9% effective fee on \$5 top-up) | Custodial (Direct bank transfer) | High (Vulnerable to chargebacks and merchant account holds) | High (Requires registered business entity and ongoing merchant review) |
| **Lemon Squeezy / Polar.sh (Rejected)** | 4.0% – 5.0% \+ \$0.50 | Merchant of Record (Fiat settlement) | Managed by MoR (Platform retains account termination rights) | Low (Merchant of Record manages global sales tax and VAT filing) |
| **NOWPayments**19 | 0.5% – 1.0% per transaction | Mixed Custodial / Non-custodial forwarding | Zero (Confirmed blockchain payments cannot be reversed) | Moderate (Requires third-party API integration and fee tracking) |
| **Cryptomus**19 | 0.4% – 2.0% per transaction | Custodial business wallet | Zero (Irreversible settlement) | High (Mandatory KYB; subject to past regulatory fines)21 |
| **Direct USDC on Layer 2 (Selected)**19 | **\$0.00** (Payer covers \~\$0.01 network gas) | **Self-Hosted** (Direct to non-custodial wallet) | **Zero** (On-chain cryptographic finality) | **Low** (Simple JSON-RPC balance monitor on Base/Polygon) |

*Implications of Crypto-Only Billing*: Restricting settlement exclusively to USDC reduces initial signup conversion by an estimated 50% to 70% compared to standard credit card workflows19. Corporate engineering teams with company credit cards will not adopt the platform1. However, this choice completely eliminates payment chargebacks, prevents merchant account freezing, opens access to international developers lacking US credit cards, and requires zero initial capital to deploy19.

## **Threat Model and Kill Criteria**

A solo operator must identify operational and economic risks early and establish clear criteria to shut down before personal capital is depleted9.

| Threat Category | Risk Level | Root Mechanism | Architectural Defense |
| :---- | :---- | :---- | :---- |
| **Upstream Margin Compression**8 | Critical | Upstream provider raises wholesale prices or limits unmetered context tokens. | Maintain a 2.0x markup buffer; prepare adapter shims for alternative aggregators9. |
| **Upstream Service Termination**6 | Critical | Upstream account suspension or domain unavailability on .bond infrastructure6. | Take daily local SQLite snapshots; maintain code paths to switch upstream keys quickly17. |
| **Negative Balance Exploitation**2 | High | Downstream clients sever connections mid-stream while output tokens continue to bill12. | Enforce mandatory in-memory balance reservations prior to forwarding requests2. |
| **Free-Tier Sybil Farming**13 | High | Distributed scrapers deplete the 20M token pool across rotating proxy networks13. | Deploy Altcha PoW challenges, /24 subnet rate limits, and dynamic throughput shedding12. |
| **Regulatory & Sanctions Risk**40 | Moderate | Potential FinCEN Money Services Business (MSB) scrutiny or OFAC violations40. | Operate strictly as a closed-loop retailer of computing services; filter sanctioned wallets21. |

### **United States Legal and Regulatory Compliance**

Operating a crypto-settled commercial API service within the United States requires adherence to specific legal boundaries:

> 1. **FinCEN Money Services Business (MSB) Exemption**: Under 31 CFR § 1010.100(ff)(5)(ii), businesses accepting payment value *solely for the bona fide purchase of their own goods or services* are exempt from federal money transmitter classification40. The platform must function strictly as a closed-loop computing gateway61. It must **never** offer peer-to-peer balance transfers, user-to-user remittances, or crypto withdrawal features40.  
> 2. **OFAC Sanctions Enforcement**: US legal standards impose strict liability for facilitating transactions with Specially Designated Nationals (SDNs)21. The operator must monitor incoming deposit transactions and cross-reference funding addresses against publicly maintained OFAC sanctions lists via open-source smart contract filters or RPC risk checks, rejecting flagged funds21.  
> 3. **Consumer Protection and Refund Disclosure**: US Federal Trade Commission (FTC) guidelines mandate that non-refundable purchase terms must be stated clearly and conspicuously before payment22. The user interface must include a mandatory confirmation checkbox before displaying deposit addresses: *"I understand that token credits are non-refundable and billable per exact token consumption"*12.

### **Operational Kill Criteria**

The business must cease operations immediately if any of the following quantitative thresholds are crossed:

* **Capital Depletion Limit**: Liquid operating capital drops below **\$30.00** without confirmed pending deposits9.  
* **Conversion Underperformance**: Following deployment of the P0 feature set and publication of the first four guides, the platform reaches 250 registered free accounts with a **30-day paid conversion rate below 1.5%**9.  
* **Upstream Service Degradation**: Wholesale provider uptime falls below **92.0%** over a rolling 7-day period, or upstream error rates exceed 15% during standard development hours41.  
* **Margin Compression**: Wholesale pricing increases such that maintaining a minimum 1.8x markup forces retail prices above 60% of official direct rates, eliminating the primary economic value proposition8.

## **Open Questions**

Before investing operational capital and commencing execution, five critical empirical questions must be verified:

| \# | Core Empirical Question | Verification Method |
| :---- | :---- | :---- |
| **1** | **Upstream Streaming Support**: Does the APInex endpoint natively support stream\_options: {"include\_usage": true} and forward raw reasoning blocks without dropping chunks6? | Execute an automated test suite sending stream\_options requests to https\://api.apinex.bond/v1/chat/completions across Claude and DeepSeek models; inspect raw SSE chunks6. |
| **2** | **Wholesale Price Stability**: Does the wholesale provider guarantee fixed per-token rates over time, or can prices adjust without prior notification8? | Review upstream terms of service and submit an inquiry to upstream support regarding price deprecation schedules and notification windows10. |
| **3** | **Hosting Storage Performance**: Does the target VPS provide local NVMe disk storage, or does it rely on networked volumes that degrade SQLite WAL write performance17? | Run an fio benchmarking script on the intended VPS to measure 4K random write IOPS under WAL workloads before deploying database schemas17. |
| **4** | **Baseline Sybil Volume**: What baseline volume of automated abuse targets an unprotected, publicly exposed free token endpoint13? | Deploy an unlisted test endpoint with standard rate limits for 48 hours to measure automated bot traffic and IP distribution patterns13. |
| **5** | **Target Audience Crypto Adoption**: What proportion of developers running Claude Code CLI, Cursor, and Cline maintain active Web3 wallets with available USDC7? | Conduct a focused poll across r/Cursor, r/LocalLLaMA, and the Aider Discord community to evaluate willingness to pay using USDC on Base or Polygon7. |

#### **Works cited**

> 1. One Endpoint for Every Model: Building with a Unified OpenAI, [https\://apinex.bond/guides/unified-openai-compatible-gateway](https://apinex.bond/guides/unified-openai-compatible-gateway)  
> 2. APInexGate — Self-Hosted Reseller Gateway Guide \| APInex Docs, [https\://apinex.bond/developers/resell](https://apinex.bond/developers/resell)  
> 3. DeepInfra Pricing Explained (2026) \- The Subscription Playbook, [https\://www\.subscriptionplaybook.com/pricing-teardowns/deepinfra/](https://www.subscriptionplaybook.com/pricing-teardowns/deepinfra/)  
> 4. Best AI Inference Platforms for Speed & Cost in 2026 \- DeepInfra, [https\://deepinfra.com/blog/best-ai-inference-platforms](https://deepinfra.com/blog/best-ai-inference-platforms)  
> 5. Together AI vs DeepInfra (2026): Cheapest Tokens vs Full Platform, [https\://www\.morphllm.com/comparisons/together-vs-deepinfra](https://www.morphllm.com/comparisons/together-vs-deepinfra)  
> 6. Resources & Developer Hub \| APInex, [https\://apinex.bond/resources](https://apinex.bond/resources)  
> 7. Autonomous Coding Agents on a Budget: Cost Guide for Cursor, [https\://apinex.bond/guides/autonomous-coding-agents-cost-guide](https://apinex.bond/guides/autonomous-coding-agents-cost-guide)  
> 8. LLM Inference Price-to-Performance Index (Q4 2026\) \- APInex, [https\://apinex.bond/benchmarks/llm-price-performance-index-q4-2026](https://apinex.bond/benchmarks/llm-price-performance-index-q4-2026)  
> 9. [unknown\_url](http://docs.google.com/unknown_url)  
> 10. APInexGate — Open-Source AI API Gateway & Reseller Storefront, [https\://apinex.bond/resell](https://apinex.bond/resell)  
> 11. Pricing — subscriptions and pay as you go \- APInex, [https\://apinex.bond/pricing](https://apinex.bond/pricing)  
> 12. Balance API — APInex, [https\://apinex.bond/developers/balance](https://apinex.bond/developers/balance)  
> 13. Cap: Lightweight, modern open-source CAPTCHA alternative using, [https\://news.ycombinator.com/item?id=44137867](https://news.ycombinator.com/item?id=44137867)  
> 14. Configuration Reference \| BridgePort, [https\://bridgeport.bridgein.com/configuration/](https://bridgeport.bridgein.com/configuration/)  
> 15. Local Analytics with SQLite and SvelteKit \- Scott Spence, [https\://scottspence.com/posts/local-analytics-with-sqlite-and-sveltekit](https://scottspence.com/posts/local-analytics-with-sqlite-and-sveltekit)  
> 16. the built-in node:sqlite module in Node 26, [https\://cnayanajith.com/blog/node-sqlite](https://cnayanajith.com/blog/node-sqlite)  
> 17. SQLite Is All You Need \- DB Pro Blog, [https\://www\.dbpro.app/blog/sqlite-is-all-you-need](https://www.dbpro.app/blog/sqlite-is-all-you-need)  
> 18. How to Fix Slow SQLite Queries \- DB Pro Blog, [https\://www\.dbpro.app/blog/how-to-fix-slow-sqlite-queries](https://www.dbpro.app/blog/how-to-fix-slow-sqlite-queries)  
> 19. Crypto Payment Gateway: Best Picks for Businesses in 2026 \- Xflow, [https\://www\.xflowpay.com/blog/crypto-payment-gateway](https://www.xflowpay.com/blog/crypto-payment-gateway)  
> 20. Best Crypto Payment Gateways 2026: 12 Compared by Fees & KYC, [https\://www\.pixelwebsolutions.com/top-crypto-payment-gateways/](https://www.pixelwebsolutions.com/top-crypto-payment-gateways/)  
> 21. No-KYC Crypto Payment Processor 2026 – 6 Real Options, [https\://0xprocessing.com/blog/no-kyc-crypto-payment-processor-2026/](https://0xprocessing.com/blog/no-kyc-crypto-payment-processor-2026/)  
> 22. OpenRouter Pricing 2026: 5.5% Fee, \$5 Min & Cheaper Option, [https\://apimart.ai/blog/openrouter-pricing-explained-model-costs-credits-provider-routing](https://apimart.ai/blog/openrouter-pricing-explained-model-costs-credits-provider-routing)  
> 23. Fireworks vs Together vs DeepInfra: Pricing, Speed, and Quality, [https\://deploybase.ai/articles/fireworks-vs-together-vs-deepinfra-pricing-speed-and](https://deploybase.ai/articles/fireworks-vs-together-vs-deepinfra-pricing-speed-and)  
> 24. OpenRouter Pricing: Fees, Credits & BYOK Explained \- Amnic, [https\://amnic.com/blogs/openrouter-pricing](https://amnic.com/blogs/openrouter-pricing)  
> 25. Pricing \- OpenRouter, [https\://openrouter.ai/pricing](https://openrouter.ai/pricing)  
> 26. Together AI Pricing In 2026: Models, Costs & Managing Your Bill, [https\://www\.cloudzero.com/blog/together-ai-pricing/](https://www.cloudzero.com/blog/together-ai-pricing/)  
> 27. Overview \- Together AI docs, [https\://docs.together.ai/docs/serverless/overview](https://docs.together.ai/docs/serverless/overview)  
> 28. Together AI Free Credits: No Free Trial, a \$5 Minimum ... \- BenchLM.ai, [https\://benchlm.ai/free-tier/together](https://benchlm.ai/free-tier/together)  
> 29. Groq API Pricing 2026: Per-Token Cost Compared \- Activepieces, [https\://www\.activepieces.com/blog/groq-api-pricing-2026-per-token-cost-compared](https://www.activepieces.com/blog/groq-api-pricing-2026-per-token-cost-compared)  
> 30. Groq Pricing In 2026: Every Model, Tier, And Cost Compared, [https\://www\.cloudzero.com/blog/groq-pricing/](https://www.cloudzero.com/blog/groq-pricing/)  
> 31. Groq API Free Tier: Real Rate Limits and Free Models, [https\://localaimaster.com/blog/groq-api-free-guide](https://localaimaster.com/blog/groq-api-free-guide)  
> 32. Novita AI Models: API Pricing, Benchmarks & Specs \- Requesty, [https\://www\.requesty.ai/models/novita](https://www.requesty.ai/models/novita)  
> 33. Runtime for AI agents to execute real-world tasks \- Novita AI, [https\://novita.ai/sandbox](https://novita.ai/sandbox)  
> 34. What Is an LLM API Gateway for Production AI Apps? \- Aimlapi, [https\://aimlapi.com/blog/llm-api-gateway](https://aimlapi.com/blog/llm-api-gateway)  
> 35. AI/ML API — AI Models & Agent Tools in One API, [https\://aimlapi.com/](https://aimlapi.com/)  
> 36. AIML API vs OpenRouter (2026): Pricing, Scale, Stripe Deal \| HokAI, [https\://hokai.io/guides/aimlapi-vs-openrouter](https://hokai.io/guides/aimlapi-vs-openrouter)  
> 37. Free Models \- Quickstart \- Requesty Docs, [https\://docs.requesty.ai/features/free-models](https://docs.requesty.ai/features/free-models)  
> 38. pi-free/docs/free\_models.md at master \- GitHub, [https\://github.com/apmantza/pi-free/blob/master/docs/free\_models.md](https://github.com/apmantza/pi-free/blob/master/docs/free_models.md)  
> 39. Groq pricing in 2026: every model, free tier, and hidden discounts, [https\://www\.eesel.ai/blog/groq-pricing](https://www.eesel.ai/blog/groq-pricing)  
> 40. FinCEN Guidance, FIN-2019-G001, May 9, 2019, [https\://www\.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf](https://www.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf)  
> 41. Rate limits \- Together AI docs, [https\://docs.together.ai/docs/serverless/rate-limits](https://docs.together.ai/docs/serverless/rate-limits)  
> 42. We encountered an issue when using your API key: Streaming error, [https\://forum.cursor.com/t/we-encountered-an-issue-when-using-your-api-key-streaming-error/147838](https://forum.cursor.com/t/we-encountered-an-issue-when-using-your-api-key-streaming-error/147838)  
> 43. ICLR 2026 Orals, [https\://iclr.cc/virtual/2026/events/oral](https://iclr.cc/virtual/2026/events/oral)  
> 44. API reference \| LayerScale, [https\://docs.layerscale.ai/api-reference/](https://docs.layerscale.ai/api-reference/)  
> 45. OpenAI \- Bifrost AI Gateway, [https\://docs.getbifrost.ai/providers/supported-providers/openai](https://docs.getbifrost.ai/providers/supported-providers/openai)  
> 46. Streaming with recursive function / tools calling \- API, [https\://community.openai.com/t/streaming-with-recursive-function-tools-calling/687313](https://community.openai.com/t/streaming-with-recursive-function-tools-calling/687313)  
> 47. Status — text model uptime \- APInex, [https\://apinex.bond/status](https://apinex.bond/status)  
> 48. An Empirical Study and Evaluation of Modern CAPTCHAs, [https\://news.ycombinator.com/item?id=38670465](https://news.ycombinator.com/item?id=38670465)  
> 49. Breaking the 4Chan CAPTCHA \- Hacker News, [https\://news.ycombinator.com/item?id=42276865](https://news.ycombinator.com/item?id=42276865)  
> 50. Spend Limits \- GroqDocs \- Groq Console, [https\://console.groq.com/docs/spend-limits](https://console.groq.com/docs/spend-limits)  
> 51. Lowest-Cost LLM Inference: The Complete OpenRouter Guide, [https\://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/](https://openrouter.ai/blog/tutorials/how-to-get-the-lowest-cost-llm-inference-on-openrouter/)  
> 52. OpenRouter Free Tier Limits 2026: 20 RPM, 50 to 1,000 RPD, [https\://klymentiev.com/blog/openrouter-free-tier](https://klymentiev.com/blog/openrouter-free-tier)  
> 53. Groq API Free Tier 2026: Key, Rate Limits, 429 Error, [https\://klymentiev.com/blog/groq-api-free-tier](https://klymentiev.com/blog/groq-api-free-tier)  
> 54. Streaming \- HIPS, [https\://hips.com/docs/operating/streaming](https://hips.com/docs/operating/streaming)  
> 55. Testing AI \- Draft Preview \- IcebergQA, [https\://icebergqa.com/book/](https://icebergqa.com/book/)  
> 56. MiMo-V2.5 Model Documentation and Integration Guide \- DeepInfra, [https\://deepinfra.com/blog/mimo-v2-5-model-documentation-integration-guide](https://deepinfra.com/blog/mimo-v2-5-model-documentation-integration-guide)  
> 57. Cursor Override OpenAI Base URL: API Key & Custom Models, [https\://docs.bettertoken.ai/en/faq/cursor/custom-openai-api](https://docs.bettertoken.ai/en/faq/cursor/custom-openai-api)  
> 58. Cryptomus Alternatives: 5 Options and How to Switch \- CryptumPay, [https\://www\.cryptumpay.com/blog-posts/cryptomus-alternatives](https://www.cryptumpay.com/blog-posts/cryptomus-alternatives)  
> 59. 10 Best Crypto Payment Gateways in 2026: Ranked and Compared, [https\://passimpay.io/en/news/top-crypto-payment-gateway-companies](https://passimpay.io/en/news/top-crypto-payment-gateway-companies)  
> 60. Application of FinCEN's Regulations to Persons Administering, [https\://www\.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering)  
> 61. MSB or Not MSB? That Is the Question (for Determining Applicability, [https\://www\.wsgr.com/en/insights/msb-or-not-msb-that-is-the-question-for-determining-applicability-of-anti-money-laundering-rules.html](https://www.wsgr.com/en/insights/msb-or-not-msb-that-is-the-question-for-determining-applicability-of-anti-money-laundering-rules.html)  
> 62. Who Needs a Money Transmitter License? Fintech Licensing Guide, [https\://complyone.tech/blog/who-needs-a-money-transmitter-license-a-fintech-guide](https://complyone.tech/blog/who-needs-a-money-transmitter-license-a-fintech-guide)  
> 63. What is Money Transmission and Why Does it Matter? \- Coin Center, [https\://coincenter.org/education/policy-and-regulation/money-transmission/](https://coincenter.org/education/policy-and-regulation/money-transmission/)  
> 64. New FinCEN Cryptocurrency Guidance Provides Comprehensive, [https\://www\.moneylaunderingnews.com/2019/05/new-fincen-cryptocurrency-guidance-provides-comprehensive-overview-of-bsa-application-to-crypto-businesses/](https://www.moneylaunderingnews.com/2019/05/new-fincen-cryptocurrency-guidance-provides-comprehensive-overview-of-bsa-application-to-crypto-businesses/)  
> 65. FinCEN Issues New Guidance Regarding Cryptocurrency, [https\://www\.consumerfinancialserviceslawmonitor.com/2019/05/fincen-issues-new-guidance-regarding-cryptocurrency/](https://www.consumerfinancialserviceslawmonitor.com/2019/05/fincen-issues-new-guidance-regarding-cryptocurrency/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAVCAYAAAC+NTVfAAACJElEQVR4Xu2UQUgWURSFj5RQWJoEqWhILox2RRQU0SqEEEVSSVKkCCpa1kLSTRBBtAnKEESQVoK6dZVQrhQEV2qrwCJ0pW4Moig957/v+b954xh/YCsPfMzMfXfefXPvnQvsa1+7q51cJkdIETlBusjZ0Ik6TG6RQfKSnE4uF66DZJRsRoyRssBP9+/JM9ghdbBF0hr4/JOGyDz5SsZJIzmQ8AB6yCwpD2yd5BOpCGwF6w05HxsDKaACv4vsF8gGaY7sOZWS6+Skey4hDbBA4Zf9LfgZsop0cL3znTyP7LnmeEt6yTJ5AUupUqWrmqbY+faTV2SOfCPT5Jxbk3yQrOCxHddIH/KnVl11IEnpWnc+0jB5gnw21Olr5KJ7boI1YRwkM/ht2Muqx2/kA0lXyC/yyD0fRbIMNbAMjMD+BpWuoOBeqscSqQ5s92Gb3QhsoarIF/IZ1slZQbLsOanBJmE11hdIuupZpVBJ7pA/5IFbl3xwofs6soJ0EB9cfZWSf0n/qNcpWEoHYAfRmrIQBvdp/wgbKEL3E+TQtpeV8qe7pqR6a+On7rkINqE0UGqd7RKs233nSzfJDySnl5pQQ0iHl/xeM0hOwm2p3upqOWhcTsFSXhn4aJPH5AO5S17DSvLQrXnpcMqW/FpggReQnv85hanSL3bc2bKkQaRNNYR2/BLYYepJG7mKZLYS2qne/033YPXuJseitT2XxqenI1rbU20B3qtycwPvM0gAAAAASUVORK5CYII=>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAVCAYAAAC+NTVfAAACIklEQVR4Xu2VT0gVURjFj6igKJolqGSILRJXBaYrdRWCi0SyhWjIWyVBC2mT5EYQIVwKEoQgCuIityJokLoS2lqCK43+rESQ2ihm57xvLnPfzBvlKbbywI/HfHPnnjvfuXcecK1rna8GMkHekx6Sn3k7rWLSBxujsXrmUsojKbJD2kgdmSdzMDOncrJKxkgpeUC+whZ6YTWRP+SlV7tLfpJer/aafCYVXq2fbJMqr5aTJskpeezV9GZrZIkUwQxlPOuNkZrJb9IVqadVRjrJneC6hHTA3tZlqgmTzPdIDWkk+4ibu66NR+rpvKbIG1gL35JFWKv0q01TiLPND8l9hCZJ5tE6HpERhKueRriB1K6DYIxylfmT4J6kzH/BJpaBFqYxUZNE8xRpgeVxAjNyaiXH5BVsF38kM7BOaPcPk78IzRVdTuZOymOX3PZqg8h825uw4/UDduRekA2EmSeZJNXT0gbTWynjgqCmX10rCkWSTZXkC8Ld7mKImjhz7auY3EM6o0715Dt5B1tILVknQ7CWS5pUm82d8+jRc1KUR8FvTMpb7R0NrjW5vlBbsC+Z5Fa/AFuMctdJWIGZOj0j32CLl9xcm7B9E5Py1q7WgA+wN1TLq70xMliGGeoYylSfUX+MpEWpW59IN8xY0egzG5PfKh2xW0EtmzTxQ/KU3EPY/qhU132Na4c9l1XZ8v5veg7Le4DciNy7cilDh//vdOX6B5C8eWJd9PpIAAAAAElFTkSuQmCC>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB8AAAAVCAYAAAC+NTVfAAACN0lEQVR4Xu2Uy6tPURiGX6HINU4h5DIgIwO3FDMphQEGonQGIkXJhDBQOiUjKSkpUTKgzuikMHCZ+ANw6qRQLgNJKQPJ5X3Ot5a99s/eTr/BMTpvPe3W2mvvb63v/b4ljWlMI2u5OW+umJ1mfP31sCabPYo1fWZB/XX3Gmd6zZDZaBaZm+aGIljWXPPIXFAE3WpemQ3Fmq61ynw1h4u5pea92Z3GE8xVM2jm5EWK0z81M4q5rnTR/DLbirmp5qEZMJPMCvMpzfEui29+mk3F3B9NN1vMwjSeYjYrTps9va724G/MPFXZYa4zON8eL+aGhV+XzElFCs+ZO2ZvelI0E/Xv4F/MSo0cHEtqIhWnVKWMBbmA1pjPaQ2+8oMd6R3C8w+KgATGU7x9YqYV6/CcbzlATb1mrdlufqjuCxX63RxT/PiBuabIBNV/QuFlDo5ov49mXRovVhRgY/AsdvfazC/mDqp+2lmK9nqnaLlD5rEqzxGbor1epvl+Vf/5y3NEgXEqPKZdEE/GWIElTeoxz1VVe5sI3lrt2btyZ0vMW3NZsREuDC6Po4rTIVJNseU+R0cUnnMJIdZiVWuf4zdpOZPGfHDWPFP1k1zJtxSbwXc64Z7qlY2v38z6NKaeOBgxGoXfVDW7u604ISnnqswiwF1FQNqQoPc71iCCvDD7zWlF9vapylZN5S1Fi81Oc03itKvNLrNMLT9UXK30NhcV9dSqJr//mw4o/CY1MzvejbrwMFNW7ajrN1pTew85JFzkAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAAAVCAYAAADl/ahuAAAD/UlEQVR4Xu2XW4hOURTHl1Dkfskl5JJIEXIpwpNEIrlESCONW0KU68tESl7EmJSUKBHeJEIML5Ty5FJKLrk8oUSJXNavtXffPvuc831nzDDR/OvfN2ftPWev/V+XvY9IC1rwv6GDslVsbIGht/KQsn088K9gkXKysqNYlHsplyvHhJPENrhUeUx5QDk8OZyLJcr1sbEgWIO1WHOBsnVyWEaJ+Y/P+M4epiqXhZMagzbKc8qfEc8ruwTz+Puacq+YE4j3SMzpcuD9tcoR8UAFsNkq5ROxDQ9UnlaekmQmIn7s+0tJB7dROK58IPbiC8rZko7UduU9ZbfARpQei5VQHhDmqJhQDcE45WflhsA2RPlGTBSPOcqnjneVm5Sdg/EmARHGoTwgCuKcjOwTlJ+UcyN7CEor3FBRHBbLBgTwIHPrlZeU7ZyNcYL3W0DJWcoB7pmTZIaYGGGGVBKILHgnaYF8lPdFdg9KgewcHNmL+MVaeQK9UPZ1tt8WCOfqlLvE0nK/WPlQFvzS9Nq6uUeUB5X3la+Ud5Rj3RjwQuQJFNs9Jok12PB4L+pXOYE+Kkc7G+PMvSJWZs+U1ZJuESlMV+6WUvSJpG9ulMYHNwecUO6U0ks5wd4rJ7pnnMDZWIhKArH+zMhW1C/ffOe7MUAPeiu2ps94fLuh7O6eh4oFeZtUuHdViW2Q/vBdSmKAKcpvyi3uuZMkFe8vtsgZseZKOTRUIPoW9p6RvUqK+cWpeV0seGQUm92h/CFJgehFvh8B5nHa4X9c2pmgPzxX9gtsayQdnRDUN3VOynJC5QmRZwdsvCY2BijiF1nBZl+LHffrlLcl2YOy4MuTwJYFzY8oUNv+mOWXZ9KbNF8pFpW1bhx4gbwjPrVjIbxA9JMQRJHeQw/KQhG/skA2PpTSKTZMTLyLkrwbeYHC/pUJv7Gwy5N2pJ+/mzDGy0KBfInVizXGrOMVkCVf3W8IsoLS4P+yUMQvfLil3CylXkJAaND+2uADFArEXLIuLMNcUOdsvsY988/chLkUDnQ2oswp5k80sFj5RZK3ZBo3F0k2Avy7uJyFN25Q6dOiiF9+874P4h8n3FUpCc+6iDHIPQP+pjWEp3QuqHNOBTbBpwMRIY37BHNwbqvypnKV2AWNNGeDPnKAxYgu8+aJbYh0j6/0bKZOOTKyhyjiFyJcFtsoVwCE4VMnnAPGi11PKPONYn3trKSDlkJYFqRfD2fLA5c2Ns6FLe/lCEbdL1ROk+wIUT61kv9p0RC/eD8CsB7rhgEL4S+a+D9I8uclkFXnfwPVUv7Torn8SmG1WJ2vUHaNxv4UyIisTwsPMqU5/MoEtetZLqJNCfrOHslPcXpcc/iVwi9vf/ST0e61QgAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADkAAAAVCAYAAAD8dkbIAAACbElEQVR4Xu2WT4iNURjGH2HBYBZCU6Yo0WxE/quZGgslhUIU0USNbJQJ+bNSFsZiamZWE0lCMZtZWZqizFBWykohlmOnUDM8z32/13e+053v3vFZ3Mn31K/ufc8595z3z3nPBUqVKvW/6DDZSRaROWQ5OU42hJNms+aRx+RXxBPSHMxrWDWR+bGxim6Tt+QTGSZ7ydzMjAbUOlgmHpJl0Vg1DZBNsbERpbu0jTwjg6Q1O5yrWk7qrq4ku0kbrDo2kwNI99H+a8mhZE5cCaqqPaSHdJAtqC8BFenHdpHn5BZZmh2uSwpKH3lDPpOXZGMwLme+wO7qELlPjpGr5Bs5ndjPkzPJXP2m7rskp1+Q7aSFnIBdjbzAViTn9pMxco0syQ7PSHfJZaTRV2f9Srb+mWGZVADekRWJbTEsuD9Ie2KTbpCPMIckOf8Alm3XdeQ4qVI5Cov6OVgZFJUOG5aXO/QIaTZ0YB283yfByngU5qh+w3UJWSe7ySTsWihwWpfbFDvJB1hZLMgO/TO5Q++RZs1tcsDlTgp9dsVO6ilSIwyfqJvIcVIKs3kRxUq1i0zBguZyh8KDFnFSUqmuIidhzTHec1r5vXyNv286OpAiG27o5TqK9PBFnLxA9qXDlSTpD8i9wFZTilL4fIQRrKUdsDVh6Rwh38nBwOaOXwlseU5OwLqqf5dTvofOqz3DgNUtLV5PnpI7ZHV2uKq0Rm+XAnQK1lh0wLPJmKQs/0R6n14h7cBu02fZ9Py4TWu0Vpkch70EempGYN228N9GOdhL1sQD00iPut5DPfiFN4+0EHa1lEk1sjDrpUrNVv0GNNF/3vZZZVUAAAAASUVORK5CYII=>

[image6]: <data:image/png;base64,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>

[image7]: <data:image/png;base64,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>

[image8]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAVCAYAAAD4g5b1AAADKklEQVR4Xu2XS6hOURiGXyHkfokUiVwycUmIEELkmnuYYCIGykkimaBccskll5SMyKVIBqKcMqAIA5eBDIiMGIiSAd63b63zr73+vc/e5/8dh/rfejp777X+vdf7rW9/+ztATTW1tLqRnqRVPBCoLekYX/yfJHN15AY5QM4g3VAHcpIsiAf+hpaRiaQTbMG9yRoyKpwEW+QqchZmZlhyGGPISzIIdp/d5APZRAaQfrBnPSWnSBv7WbamkYdkJSwVqpUeeJn8irhCugbzdHwHZkBBUSBkbEkwZwu5Tzq780lkKxkOW+9qspxchxkvJEV4HXlG1iM9VZqic+Q5eUeukrmkdWIGsI08It2Da1r8K9LHnV8g9bBgSNrp4+5Y0m7vR4Xpq51VxB6TnaRLcriwtCAtLEsyKKMyE2os+YrS4ncgaVbje9yxNJMcRYH0bUzahemwFDoIq4RNUZ5ZpeEnlJvVb76Rve58KnmNUopuRCkQqgN6XQqnb56UJuPJPXKC9E0OZ0pzj5An5D15QEYH495Ulll/XZmmwqP3XUXpEmyXtZPa0YrSN0/tyC7YwgdHY2k6T7aj9J6qEn8m49z5fFjRyjMrKeAjYSmr2iLJpE9fvyGHyWx3XpHCwrUZxQuXqmdYkJRqCtRF2ALnoLjZWLrXNfdXUvW+S4bA6sxid72wZErmlIZ/4pOk9H9L3sAqbZaprOtecfrq86XPpqq4pHufRqmgNSpVX0VHN1iI8s9FEa0lP8mG4Jo3K3SsJuEjyk15s6rCaQrTV1J6f4G9FpJSeB9yaosGVVRUiNT5VGLSS99PpWho1qdxPSzqQse3SPuGWcAM8sP9jRWnr+SD481KMqvuKlXzYL3nCFTxcgeaAAtcmPoryHckuyMVLTUdA925nq1uSlkVdlqST18VqVA+iN6sgqjq3athRjNLi66DZYm6sWOwb6q+kWEw/WdF8xbBjL5Aef8sKX3VKcWboSCoW/Njk2FNRzyv2dUfZmIWynfKS4saSpaSKUgvhGpoZCirsekBq/K3yU3kNBl6gKqY3ts81LVU8z63uJQ2+herCIeQU+lq+gf0G7g+lPSOY3nyAAAAAElFTkSuQmCC>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAVCAYAAAD4g5b1AAAC1UlEQVR4Xu2WS6hNURzGPyHkmStSyk0MTFDSjdClFHkVl8SMMmCgrm63JBIDj4iQRyZMiISMlHKj5BUGkmJCGBooyojv67/XOWuvu/bjnh3urfPVr3POXmvvs7+1vvVfC2iqqf+tcaSFDAobPA0lI8OLA0kyt5vcIUfJBcQNjSBnyZqw4V9qMNlIWoPrUivZTKbA+g0ns8n25Ls0l7wl02DGD5IvZCeZCrt3A3lFzpEhdlu2lpAnZBMsClWlUV5NTsFe7AfspUMtIL/Ibw/1Xen16SSPyOjk90LSRWbC3ncLbDBvw4yXkl5wK3lNtiEelbLSs1aQdrIf2WbdrL2D/e8BMjnVA7hMesio5LfuOV1rtdk+ggbjq5nViL0ge8mYdHOf1Y18s/6Lx7QHabPzyKFaK7CMnESJ+OZJa2gpLELHYJWwEVU1207eox7RHajP4kRy3WurLMWkjTwgZ9A7ZkUqMnuLXCEfyCdY7LUMnJQ0FZ4bsKJ0DTbLmknNaEPxLdIwso98JtODtjwVmX2K+vOUnmfkItKFUgOuKq3IuoGQSRdfNyEnyPLkd0PyC9cu9L1w5ZmNHQK0RlWh5wfXfSm2N5NPaT25T2bA6sy65Hpp6SVk7iWqbUl5ZmNSf21B2nJiCuM7FrZtaguSJpHzqBe0XKn6anT0gLWwQlVFWWYV2efkDazQODmz+ozJj6+keH+H7euSInwYBbVFjSpAKkTa7KuadMoyq//7iN5mFWOZjRWeML6SnqvnO7OSzOp0FdUq2NlzFios7gzJ7E/Y/uhLM6O4qbA4KZIPYetP3325+KpI+ZJxFU1nVvFV9Z5Q6/GXpfWuLeIb0kfBr7CK6aTRd/u4Tm063z5GfN/UTOukFE6GBuGS17YIdugI+/ULqfAtJh2w825s+Wh9y5A+YxpPrpJ75C7ig1WT/lBVTOuoCK2v2AsNGM2BbeRlOI6CStdUP9Af1lyGYKa7Dg8AAAAASUVORK5CYII=>