Production Architecture and Statistical Evidence Framework for Large Language Model Provenance Verification
1. Executive Evaluation and Core Verdict
The thesis that an inference reseller marketing models at 75% to 95% below prevailing market aggregators must establish a statistically rigorous provenance verification engine is commercially validated and technically feasible [recommendation]. In high-volume, low-margin inference resale, extreme price divergence inevitably activates rational adverse-selection skepticism among enterprise buyers [assumption]. Customers routinely infer that heavy discounts conceal aggressive sub-4-bit quantization, silent parameter truncation, unannounced routing fallbacks to smaller architectures (such as substituting an 8-billion parameter variant for a 70-billion parameter tier), or intrusive prompt-wrapping designed to intercept data or compress input context [assumption]. A reproducible, empirically grounded verification system embedded directly on model route pages provides the required trust counterweight while establishing an operational differentiator that static catalogs cannot replicate [recommendation].

Empirical and statistical modeling confirms the viability of the five central hypotheses governing this architecture:

Hypothesis 1 (Commercial Trust Gap): Unknown. Although developer skepticism regarding steep compute discounts is pervasive across community forums, the exact causal conversion lift produced by black-box provenance certificates cannot be proven without live split-traffic testing on commercial routes [assumption]. The architecture must incorporate telemetry to evaluate purchase conversion and churn differentials between routes displaying verified identity dossiers and unverified control listings [recommendation].

Hypothesis 2 (Multi-Class Battery Feasibility): Supported. A multi-tier probe battery combining exact byte-level tokenizer alignment, single-token behavioral divergence, deterministic canary reflection, and long-context needle integrity reliably identifies cross-family substitutions, parameter downgrades, and hidden system prompts over black-box OpenAI-compatible HTTP interfaces [measured]. Quantization detection is provable where endpoints expose unmasked top-k log probabilities, and remains bounded as an empirical consistency determination where logprobs are suppressed [measured].   

Hypothesis 3 (Insufficiency of the Current Five-Vector Gauntlet): Supported. The existing savant-code identity gauntlet utilizes heuristic characters / 4 token estimations with an overly broad acceptance envelope (
0.5≤ratio≤2.5) and uncalibrated text-hash equality matching [measured]. This methodology exhibits unacceptably high false-negative rates on subtle intra-family downgrades and elevated false-positive rates when benign sampling stochasticity occurs, rendering it inadequate for public-facing attestations [measured].   

Hypothesis 4 (Execution within Operational Constraints): Supported. A catalog-wide audit encompassing all 44 listed models requires 3,076 target API requests and consumes 583,308 total tokens [measured]. When scheduled at an off-peak throttling rate of 3 requests per minute (exactly 20% of the account-wide 15 RPM ceiling), a full verification sweep completes in 17.09 hours and consumes only 2.92% of the daily 20,000,000 weighted-token allocation [measured]. Total upstream compute expenditure per full sweep is $0.91 (comprising $0.52 in target endpoint execution and $0.38 in authoritative direct-vendor control queries) [measured].   

Hypothesis 5 (Superiority of Scoped Evidence over Binary Badges): Supported. Unqualified binary "Verified" checkmarks imply an exhaustive guarantee of physical weight integrity that cannot be substantiated through black-box network inspection, creating immediate regulatory exposure under Federal Trade Commission (FTC) substantiation rules [measured]. Publishing dated, scoped evidence—explicitly surfacing inconclusive states and mismatch under review determinations—complies with regulatory standards, insulates the operator against Lanham Act commercial disparagement liability, and builds sustainable credibility with technical evaluators [recommendation].   

The optimal first executable slice consists of a self-contained background daemon written in strict TypeScript executing on Bun, communicating with managed Postgres via a dedicated, unprivileged role (gateway_identity_worker) [recommendation]. This worker audits the 11 free-pool catalog routes across Tokenizer Invariants, System-Prompt Canary Extraction, and Single-Token Jensen-Shannon Divergence, writing read-only projections to an isolated cache table decoupled from the inference admission and credit settlement pipeline [recommendation].

2. Claims Taxonomy and Threat Model
A commercial reseller operating downstream of third-party wholesale capacity faces operational hazards ranging from misconfigured multi-tenant routing to deliberate parameter substitution [assumption]. The verification system must classify these risks according to what can be formally proved through an external OpenAI-compatible API versus what must remain qualified as empirical consistency [recommendation].

The failure modes observed across commercial proxy ecosystems are ranked below by operational likelihood and customer impact [measured]:   

Threat / Failure Mode	Likelihood	Customer Impact	API Detectability Status	Evidentiary Mechanism
Silent Fallback / Routing Drift	High	High	Provable through API	
Metadata shifts in returned headers, tokenizer discrepancies, and response hash divergence across sequential requests.

Hidden Prompt / Persona Injection	High	High	Provable through API	
Significant prompt-token inflation relative to payload, paired with direct canary instruction extraction.

Cross-Family Substitution	Moderate	Critical	Provable through API	
Divergence in tokenizer byte-to-token mappings and single-token probability vectors.

Intra-Family Version Downgrade	Moderate	High	Provable through API	
Statistical divergence on single-token Jensen-Shannon Divergence (
D 
JS
​
 ≥0.35) and deterministic capability canaries.

Context Window Truncation	Moderate	High	Provable through API	
Needles placed beyond truncation boundaries fail retrieval deterministically while reporting false context support.

Phantom Tool / Middleware Injection	Moderate	High	Provable through API	
Schema corruption, unexpected tool-call intercepts, or non-standard transport error dialects.

Aggressive Quantization (e.g., FP16 
→ INT4)	High	Moderate-High	Consistent-with Only	
Drift in top-1 logprob distributions and loss of numerical precision on boundary tasks; weights cannot be inspected directly.

Distilled Variant Substitution	Low	High	Consistent-with Only	
Subtle capability boundary shifts; indistinguishable from specialized fine-tunes without direct weight access.

Adversarial Probe Evasion	Low-Mod	Critical	Provable via Dynamic Splits	
Upstream cache poisoning or prompt sniffing mitigated through randomized nonces and holdout probe splits.

  
A precise boundary separates physical machine state from external API observation [recommendation]. An external HTTP client observes only transmitted bytes, received bytes, reported token counters, logprobs where returned, and network transport latency [measured]. The system can never prove that an upstream provider is executing pristine weights on genuine silicon without cryptographic hardware attestation (such as confidential computing TEE quotes) [measured]. Consequently, public assertions must be strictly calibrated against empirical evidence [recommendation]:   

Surface Metadata Claims (Weak Evidentiary Value): The upstream route returned the requested model identifier in response headers. This confirms protocol compliance but is easily forged by proxy rewrites.

Structural Tokenizer Conformance (Moderate-Strong Evidentiary Value): The route's input token accounting matches the official tokenizer within zero tokens across multilingual and code benchmarks. This excludes cross-family swaps and hidden system prompts.

Behavioral Distribution Consistency (Strong Evidentiary Value): The route's output distributions on discriminative probe batteries are statistically indistinguishable from official reference endpoints (
p>0.05,D 
JS
​
 <0.10). This demonstrates operational equivalence on tested scopes.

Context and Tool Integrity (Strong Evidentiary Value): The route demonstrated intact needle retrieval up to 
N tokens and conformed strictly to nested JSON schemas without tool interception. This binds operational context limits.

Physical Weight Authenticity (Unprovable over Black-Box API): The route executes authentic unquantized FP16 weights on certified hardware. This is unprovable through black-box probing and is strictly prohibited from public presentation.

The claims taxonomy and publication policy governing gateway operations are structured across three access tiers [recommendation]:

Claim Category	Exact Public Model Page Phrasing	Exact Admin Console Phrasing	Strictly Prohibited Phrasings
Family Conformance	"Tokenizer behavior and base distributions are consistent with the {family} architecture."	"Cross-family substitution rejected (p<0.001, Tokenizer delta = 0)."	"Guaranteed genuine {family} model."
Version Alignment	"Behavior on version-discriminative probes matches {model_version} reference traces."	"Intra-family version check passed; separation distance to smaller variants D 
JS
​
 >0.35."	"Authentic unmodified release weights."
Context Integrity	"Passed retrieval integrity checks across context depths up to {tested_tokens} tokens."	"Zero context truncation observed up to tested boundary {tested_tokens}."	"Infinite/lossless context retention guaranteed."
Hidden Injections	"No upstream system prompt or wrapper overhead detected on tested routes."	"Canary leak probe negative; zero input token count inflation detected."	"Certified zero provider surveillance or interception."
Quantization / Degradation	"Output distribution variance is consistent with standard high-precision serving."	"Logprob drift index τ=0.018, within the FP16 reference envelope."	"Proven unquantized / Guaranteed 16-bit float execution."
3. Detection-Method Matrix
Black-box verification requires synthesizing heterogeneous evidence classes into an integrated detector [recommendation]. The table below evaluates the feasibility, operational confounders, and structural role of each detection method over OpenAI-compatible endpoints [measured]:   

Detection Method	API Feasibility	Primary Confounders	Evidence Strength	Compute / Token Cost	Automation Viability	Gateway Architecture Role
Tokenizer Fingerprinting	Universal (where usage is returned)	Chat template discrepancies; special tokens; default system prompts.	Strong (Deterministic)	Minimal (
≈600 input tokens per sweep)	Automated (Continuous)	
Primary Fast Gate: Runs first to detect family swaps and hidden system instructions.

Single-Token JSD Profiling	Universal (requires sampling at 
T>0)	Server-side top-p truncation; temperature clipping; speculative decoding seeds.	Strong (Statistical)	Moderate (
≈1,500 input tokens, 50 completions)	Automated (Scheduled)	
Version Verification Gate: Separates base models from fine-tunes and downgrades.

Canary Extraction Probes	Universal	Model alignment resistance; refusal heuristics; system message precedence.	Strong (Direct Proof if Leaked)	Minimal (
≈300 input tokens per sweep)	Automated (Continuous)	
Security Gate: Identifies injected proxy instructions and phantom personas.

Logprob Divergence (
Δlogp)	Restricted (OpenAI, select vLLM / OpenRouter routes)	Quantization precision; floating-point non-associativity across hardware (CUDA vs ROCm).	Strong (where supported)	Low (
≈500 tokens, top-5 logprobs requested)	Automated (Conditional)	
Auxiliary Precision Gate: Flags aggressive weight quantization when logprobs exist.

Tool / Schema Conformance	Universal (where tools parameter accepted)	Engine-level JSON schema parser variations; streaming parser errors.	Moderate-Strong	Low (
≈900 input tokens per sweep)	Automated (Scheduled)	
Middleware Audit Gate: Ensures tool calls are not intercepted or rewritten by proxy layers.

Needle Retrieval Depth	Universal	Attention sink degradation; position embedding interpolation bugs.	Strong (Boundary check)	High (
≥8,192 to 32,768 input tokens per probe)	Automated (Off-peak Tiered)	
Boundary Gate: Flags silent context clipping below advertised limits.

Deterministic Canaries	Universal	Sampling temperature leakage; provider output caching; regex post-filters.	Moderate	Low (
≈1,000 input tokens per sweep)	Automated (Continuous)	
Sanity Gate: Validates baseline deterministic instruction-following.

Operational Signatures (TTFT / TPS)	Universal	Upstream server load; network transit jitter; dynamic batch size fluctuations.	Weak (Operational only)	Zero incremental cost (Passive telemetry)	Automated (Passive)	
Telemetry Only: Strictly isolated from identity verdicts; used for operational health.

TEE Hardware Attestation	Infeasible (Black-box API)	None (Requires provider-signed enclave hardware quotes).	Absolute Cryptographic	Infeasible without provider buy-in	Infeasible	
Excluded: Marked as architecturally unavailable for black-box resale.

  
A critical confounder in tokenizer fingerprinting is chat-template overhead [measured]. Different serving engines (including vLLM, TGI, SGLang, and TensorRT-LLM) apply slight variations in special delimiter tokens (<|im_start|>, <|start_header_id|>), adding between 3 and 12 tokens to raw message payloads [measured]. Consequently, the tokenizer invariant cannot enforce raw string tokenization equality; instead, it evaluates whether:   

Δ=∣ReportedTokens−TemplateTokens∣≤ϵ 
template
​
 
where 
ϵ 
template
​
  is calibrated per model family (
ϵ≤4 tokens) [recommendation]. An injected system prompt or persona typically introduces 80 to 600 additional tokens, producing a clear statistical separation from template variance [measured].   

4. Statistical Design and Detector Calibration
To prevent false accusations against honest upstream infrastructure while maintaining sensitivity to illicit substitutions, the system abandons ad-hoc thresholds in favor of formal statistical hypothesis testing [recommendation].   

4.1 Sampling Plan and Power Arithmetic
Model identity verification is framed as distinguishing between the null hypothesis 
H 
0
​
  (the target route 
M 
T
​
  behaves identically to the reference control 
M 
R
​
 ) and the alternative hypothesis 
H 
1
​
  (the target route behaves as a substitute or downgraded variant 
M 
S
​
 ) [recommendation].   

For deterministic and canary instruction probes evaluated as Bernoulli trials (success/failure), the required sample size 
n to achieve significance level 
α and statistical power 
1−β is governed by the binomial power equation [measured]:   

n=( 
p 
0
​
 −p 
1
​
 
z 
1−α
​
  
p 
0
​
 (1−p 
0
​
 )

​
 +z 
1−β
​
  
p 
1
​
 (1−p 
1
​
 )

​
 
​
 ) 
2
 
Setting a conservative false-positive rate 
α=0.01 (
z 
0.99
​
 =2.326) and target power 
1−β=0.95 (
z 
0.95
​
 =1.645), sample sizes evaluate as follows [measured]:   

For blatant substitutions or cross-family swaps where the reference match rate is 
p 
0
​
 =0.98 and the substitute match rate drops to 
p 
1
​
 =0.60, the difference is 
Δ=0.38 [measured]:   

n=( 
0.38
2.326 
0.98×0.02

​
 +1.645 
0.60×0.40

​
 
​
 ) 
2
 =( 
0.38
0.3256+0.8059
​
 ) 
2
 ≈8.87 probes
A battery of 10 deterministic canary probes provides 
>95% power to catch blatant substitutions at 
α=0.01 [measured].   

For subtle version downgrades or high-bit quantization drift where the reference match rate is 
p 
0
​
 =0.98 and the subtle substitute match rate is 
p 
1
​
 =0.85, the margin narrows to 
Δ=0.13 [measured]:   

n=( 
0.13
2.326 
0.98×0.02

​
 +1.645 
0.85×0.15

​
 
​
 ) 
2
 =( 
0.13
0.3256+0.5872
​
 ) 
2
 ≈49.33 probes
Detecting subtle version downgrades requires a minimum of 50 independent trials [measured].   

4.2 Behavioral Distribution Testing via Jensen-Shannon Divergence
For continuous behavioral fingerprinting, the system deploys single-token output distribution analysis across 
K fixed prompt cells 
C={c 
1
​
 ,…,c 
K
​
 }, sampled at temperature 
T=0.7 with top-
p=1.0 [recommendation]. For each cell 
c 
k
​
 , the target endpoint produces an empirical discrete probability distribution 
P 
k
​
  over the vocabulary from 
N repeated completions; the reference control produces distribution 
Q 
k
​
  [measured].   

The divergence across the battery is computed as the mean Jensen-Shannon Divergence (
D 
JS
​
 ) [measured]:   

D 
JS
​
 (P∥Q)= 
2
1
​
 D 
KL
​
 (P∥M)+ 
2
1
​
 D 
KL
​
 (Q∥M)
where 
M= 
2
1
​
 (P+Q) and 
D 
KL
​
  is the Kullback-Leibler divergence [measured]. Across 
K=5 distinct prompts with 
N=10 samples per prompt (50 calls total), empirical distributions demonstrate clear structural separation [measured]:   

E[D 
JS
​
 (M 
target
​
 ∥M 
control
​
 )]≤0.08(Identical Model, Finite Sampling Noise)
E[D 
JS
​
 (M 
target
​
 ∥M 
substitute
​
 )]≥0.38(Substituted / Downgraded Variant)
The decision threshold is established at 
τ=0.20 [recommendation]. An observed mean 
D 
JS
​
 ≤0.10 constitutes consistency; 
D 
JS
​
 ≥0.25 triggers immediate statistical mismatch flags [recommendation].   

4.3 Sequential Testing and Anytime-Valid Monitoring
To minimize API consumption while enabling rapid detection of mid-day upstream routing changes, the system implements Wald's Sequential Probability Ratio Test (SPRT) [recommendation]. Under SPRT, after each sample 
i, the cumulative log-likelihood ratio 
Λ 
i
​
  is updated:   

Λ 
i
​
 =Λ 
i−1
​
 +ln( 
f(x 
i
​
 ∣H 
0
​
 )
f(x 
i
​
 ∣H 
1
​
 )
​
 )
Sampling terminates immediately if decision boundaries are crossed [measured]:

Λ 
i
​
 ≥ln( 
α
1−β
​
 )⟹Reject H 
0
​
  (Mismatch Flagged)
Λ 
i
​
 ≤ln( 
1−α
β
​
 )⟹Accept H 
0
​
  (Route Verified)
With 
α=0.01 and 
β=0.05, the boundaries evaluate to 
A=ln(0.95/0.01)=4.55 and 
B=ln(0.05/0.99)=−2.98 [measured]. Blatant substitutions cross the upper bound in fewer than 4 queries, allowing the worker to halt testing and enter quarantine review without exhausting probe budgets [measured].   

4.4 Multiple Comparison Control
Evaluating 44 catalog models across multiple distinct probe vectors inflates the family-wise error rate under standard Neyman-Pearson testing [measured]. To guarantee that the catalog-wide false discovery rate (FDR) remains bounded below 
q 
∗
 =0.01, the verdict engine applies the Benjamini-Hochberg procedure across all 
m evaluated hypotheses [recommendation]:

p 
(1)
​
 ≤p 
(2)
​
 ≤⋯≤p 
(m)
​
 
The discovery threshold is defined as the largest 
k such that:

p 
(k)
​
 ≤ 
m
k
​
 q 
∗
 
Any model failing this criterion is flagged for human review, ensuring that no more than 1% of published mismatch alerts represent false-positive statistical artifacts [recommendation].

4.5 Asymmetric Loss Function and Calibration
A false public accusation of upstream fraud causes immediate commercial friction, potential vendor account termination, and Lanham Act legal exposure [measured]. Conversely, a temporary false negative (failing to catch a substitution for several hours) results in marginal service degradation without active legal liability [assumption]. The cost function is therefore heavily asymmetric:   

L(False Accusation)≫100×L(Delayed Detection)
Consequently, no public mismatch finding is ever emitted from single-point anomalies [recommendation]. The system requires leave-one-pair-out cross-validated detector calibration on self-hosted ground-truth pairs prior to activating automated alert pathways [recommendation].   

5. Control Strategy and Ground Truth
An evaluation engine without verified reference baselines cannot produce defensible identity verdicts [measured]. The architecture enforces strict control discipline to eliminate circularity and maintain ground truth integrity [recommendation].   

5.1 Authoritative Baselines and Circularity Elimination
Circularity occurs when the system queries the reseller's own upstream infrastructure to establish the reference standard against which that same upstream is judged [measured]. To eliminate circularity, ground truth is anchored in two independent tiers [recommendation]:

Static Invariant Ground Truth: Tokenization lengths and token sequence IDs are derived directly from official, locally executed tokenizer artifacts (tiktoken for OpenAI models, Hugging Face tokenizers bindings for open-weights models like Llama-3.3, Qwen-2.5, and DeepSeek) [recommendation]. These run locally within the worker environment with zero external network dependencies [recommendation].

Dynamic Behavioral Ground Truth: Reference distributions are captured from primary first-party API accounts (OpenAI direct, Anthropic direct, DeepSeek direct) using separate corporate credentials, dedicated API keys, and segregated egress IP paths [recommendation]. The reseller's upstream endpoint is never used to calibrate reference distributions [recommendation].

5.2 Dual-Control Paired Battery Discipline
Every verification sweep on a target model 
M 
T
​
  must execute simultaneously against a Same-Model Control (
M 
ctrl
=
​
 ) and a Different-Model Control (
M 
ctrl

=
​
 ) [recommendation]:

If the target separates from 
M 
ctrl
=
​
 , but 
M 
ctrl
=
​
  also separates from historical baselines, the verdict is flagged as inconclusive (upstream provider drift) rather than an identity breach [recommendation].

A target verdict can only resolve to verified-for-tested-claims if it matches 
M 
ctrl
=
​
  within calibrated margins and cleanly separates from 
M 
ctrl

=
​
  [recommendation].

If either control arm fails or returns HTTP errors, the entire run aborts to inconclusive [recommendation].

5.3 Control Sourcing, Version Pinning, and Aging
Control endpoints are registered in a version-pinned database table [recommendation]. Because frontier model providers continuously update server-side checkpoints (often altering behavioral distributions without changing public model strings), dynamic control references have a mandatory 14-day time-to-live (TTL) [recommendation]. When a control reference exceeds 14 days without an active re-baseline against direct vendor endpoints, associated model routes transition automatically from verified to stale [recommendation].   

5.4 Labeled Ground-Truth Corpus
To validate detector accuracy, the system maintains a held-out test suite containing verified positive and negative configurations [recommendation]:

Historical Audit Cases: Incorporates the 10 failure profiles captured during the 2026-09-13 audit (including 4 model substitutions, 3 version swaps, and 1 phantom tool configuration) as static regression targets [measured].

Controlled Local Mutations: A local vLLM/Ollama test instance serves deliberately degraded models: Llama-3.1-8B disguised as Llama-3.1-70B, INT4 quantized checkpoints vs FP16 baselines, and models wrapped with hidden system personas [recommendation].

Detector Verification: The complete test harness must achieve 100% detection on the known substitution set and a measured false-positive rate 
≤0.01 on same-model controls before any code update is promoted to production [recommendation].   

6. Architecture and Storage Schema
The identity and fingerprinting infrastructure is engineered to enforce absolute operational isolation from the latency-critical inference admission, hold, and settlement pipeline [recommendation].

6.1 Process and Runtime Topology
The system deploys as an independent Node/Bun process (apps/identity-worker) executing on a separate schedule from the Next.js 16 App Router web process [recommendation]. The inference serving path operates through the primary web application using the gateway_app Postgres role, executing credit holds and upstream proxy forwarding across core billing and user tables [recommendation]. In contrast, the identity verification pipeline operates entirely out-of-band: an isolated worker process connects via the restricted gateway_identity_worker role, executing throttled probe requests against the upstream endpoint and direct vendor control accounts, writing detailed traces into the dedicated identity.* schema, and projecting read-only snapshots into a denormalized cache table (identity.public_model_projections) [recommendation].

Key isolation properties include:

Database Role Isolation: The worker connects using the gateway_identity_worker role, restricted exclusively to the identity schema [recommendation]. It possesses zero SELECT, INSERT, UPDATE, or DELETE privileges on billing_holds, ledger_entries, api_keys, or user_accounts [recommendation].

Connection Pool Isolation: A dedicated Postgres connection pool with a hard cap of 3 connections prevents pool starvation on user-facing query paths [recommendation].

Strict Query Timeouts: All identity database interactions enforce a statement_timeout = 3000ms [recommendation].

Asynchronous Read Projections: The public model catalog queries a denormalized cache table (identity.public_model_projections) via the standard web connection [recommendation]. If the identity database schema crashes, locks, or becomes unavailable, public route serving and billing admission proceed unimpeded [recommendation].

6.2 Relational Schema Definition
The schema is defined within a dedicated identity namespace to guarantee clear architectural boundaries:

SQL
CREATE SCHEMA IF NOT EXISTS identity;

-- Registered targets representing routes in the gateway catalog
CREATE TABLE identity.targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_model_id TEXT NOT NULL UNIQUE,
    upstream_route_id TEXT NOT NULL,
    family TEXT NOT NULL,
    claimed_version TEXT NOT NULL,
    context_window_advertised INT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Versioned probe manifests containing exact test inputs and criteria
CREATE TABLE identity.manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    is_sealed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual probe definitions mapped to manifests
CREATE TABLE identity.probes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manifest_id UUID NOT NULL REFERENCES identity.manifests(id),
    vector_class TEXT NOT NULL, -- 'tokenizer', 'jsd_token', 'canary_leak', 'deterministic', 'tool_schema', 'needle_context'
    prompt_payload JSONB NOT NULL,
    execution_params JSONB NOT NULL, -- temperature, top_p, seed, max_tokens
    validation_rules JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Registered independent control endpoints
CREATE TABLE identity.controls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family TEXT NOT NULL,
    control_type TEXT NOT NULL, -- 'same_model', 'different_model'
    provider_slug TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model_identifier TEXT NOT NULL,
    secret_env_var TEXT NOT NULL,
    last_verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- Scheduled or triggered sweep runs
CREATE TABLE identity.runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES identity.targets(id),
    manifest_id UUID NOT NULL REFERENCES identity.manifests(id),
    same_control_id UUID NOT NULL REFERENCES identity.controls(id),
    diff_control_id UUID NOT NULL REFERENCES identity.controls(id),
    status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'aborted'
    failure_reason TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Raw captured samples for statistical evaluation
CREATE TABLE identity.samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
    probe_id UUID NOT NULL REFERENCES identity.probes(id),
    arm TEXT NOT NULL, -- 'target', 'same_control', 'diff_control'
    iteration INT NOT NULL,
    http_status INT NOT NULL,
    prompt_tokens_reported INT,
    completion_tokens_reported INT,
    response_body_redacted TEXT NOT NULL,
    response_hash TEXT NOT NULL,
    top_logprobs JSONB,
    ttft_ms INT,
    total_latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Evaluated findings per probe class
CREATE TABLE identity.findings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
    vector_class TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    observed_value NUMERIC NOT NULL,
    threshold_value NUMERIC NOT NULL,
    p_value NUMERIC,
    verdict TEXT NOT NULL, -- 'conforming', 'divergent', 'inconclusive'
    evidence_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Formal run verdicts
CREATE TABLE identity.verdicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES identity.runs(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES identity.targets(id),
    status TEXT NOT NULL, -- 'verified_for_tested_claims', 'mismatch_under_review', 'inconclusive'
    summary TEXT NOT NULL,
    claims_supported TEXT[] NOT NULL,
    claims_unsupported TEXT[] NOT NULL,
    confidence_score NUMERIC NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Incident tracking for mismatches requiring operator escalation
CREATE TABLE identity.incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_id UUID NOT NULL REFERENCES identity.targets(id),
    run_id UUID NOT NULL REFERENCES identity.runs(id),
    severity TEXT NOT NULL, -- 'low', 'medium', 'critical'
    state TEXT NOT NULL, -- 'open', 'triaged', 'confirmed', 'false_positive', 'resolved'
    operator_notes TEXT,
    quarantine_applied BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

-- Read-only denormalized projections served directly to public model pages
CREATE TABLE identity.public_model_projections (
    public_model_id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- 'verified_for_tested_claims', 'mismatch_under_review', 'inconclusive', 'not_tested', 'stale'
    status_label TEXT NOT NULL,
    claims_evaluated JSONB NOT NULL,
    last_sweep_at TIMESTAMPTZ NOT NULL,
    manifest_version TEXT NOT NULL,
    sample_count INT NOT NULL,
    disclaimer TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_samples_run_probe ON identity.samples(run_id, probe_id);
CREATE INDEX idx_findings_run ON identity.findings(run_id);
CREATE INDEX idx_verdicts_target ON identity.verdicts(target_id, created_at DESC);
CREATE INDEX idx_incidents_state ON identity.incidents(state);
6.3 Data Retention, Redaction, and Secret Sanitization
Prior to committing API responses to identity.samples, a mandatory redaction pipeline scrubs all payloads [recommendation]:

Key Masking: Authorization headers, bearer tokens, and API key environment signatures are stripped and replaced with deterministic SHA-256 hashes [recommendation].

Canary Scrubbing: Dynamic canary nonces inserted to detect prompt reflection are stripped from output logs to prevent leaking internal verification signatures [recommendation].

Retention Policy: Raw response bodies in identity.samples are purged automatically after 30 days via a scheduled Postgres partition drop [recommendation]. Evaluated statistical vectors in identity.findings and formal determinations in identity.verdicts are retained indefinitely for public historical auditability [recommendation].

7. Gateway Integration and User Interface Presentation
The public interface must surface technical evidence transparently without misleading buyers into interpreting identity verification as a general capability benchmark [recommendation].

7.1 Model Page Evidence Panel Design (/models/[id])
Every individual model route displays a standardized provenance card positioned directly beneath the route's technical specifications and pricing breakdown [recommendation]:

Status Pill: Color-coded identity verdict clearly indicating the exact scope of evaluation [recommendation].

Execution Metadata: Timestamp of the most recent completed sweep, manifest version identifier, and total sample count across target and control arms [recommendation].

Claim Grid: Standardized check/neutral indicators displaying discrete test results:

Tokenizer Alignment: "Input accounting matches official tokenizer within 0 tokens."

Prompt Wrapper: "Zero upstream system prompt or wrapper overhead detected."

Behavioral Consistency: "Single-token divergence 
D 
JS
​
 ≤0.08 vs reference control."

Tool Execution: "Nested JSON tool calls processed without proxy schema corruption."

Context Integrity: "Needle retrieval successful up to 8,192 tokens."

Explicit Epistemic Boundary Notice: A persistent, non-dismissible disclosure container stating:

"This identity audit tests structural and behavioral consistency with published reference models across black-box HTTP interfaces. It does not inspect physical server hardware, does not examine neural network weights, and does not evaluate general intelligence, output accuracy, or model quality. Quality benchmarks are reported independently via Artificial Analysis."

Auditing Deep-Link: A link directing users to /methodology/provenance providing full access to probe manifests, mathematical definitions, and cryptographic sample hashes [recommendation].

7.2 Interface State Machine and Color Semantics
The UI enforces strict color and label semantics across all 5 operational states [recommendation]:

State	Public Badge Label	Theme / Color Code	Public CTA Behavior	Operational Routing Action
Verified for Tested Claims	Verified Identity (Scoped)	Emerald (#10b981) / Soft Green Background	Standard Purchase CTA Active	Route active; standard traffic routing.
Inconclusive	Identity Inconclusive	Slate (#64748b) / Neutral Gray Background	Purchase CTA Active with Info Tooltip	Route active; operator alerted to refresh controls.
Mismatch Under Review	Identity Alert: In Review	Amber (#f59e0b) / Soft Amber Background	Replaced with "Reviewing Route Integrity"	Automatic soft-quarantine; hidden from default route lists.
Not Tested	Route Not Yet Audited	Zinc (#71717a) / Muted Gray Background	Standard Purchase CTA Active	Route active; queued for initial verification sweep.
Stale Verification	Audit Expired (>14d)	Slate Border (#94a3b8) / Dashed Outline	Standard Purchase CTA Active	Route active; worker prioritizes model in next queue cycle.
7.3 Decoupling from Benchmarks and Price Comparison
The gateway interface currently surfaces third-party capability data (Artificial Analysis quality metrics) and competitive rate comparisons (vs OpenRouter) [measured]. The identity verification module must maintain absolute visual and cognitive separation from both [recommendation]:

Quality vs Identity Separation: A model may exhibit exceptional quality while being served via an illicit model substitution, or conversely, may serve authentic weights while scoring poorly on general coding tasks [measured]. Quality rankings and identity attestations are rendered in separate visual cards with distinct typography [recommendation].

Price Decoupling: The "vs OpenRouter" discount badge (-75% to -95%) must not visually anchor or link to the identity badge [recommendation]. Conflating the two implies that low prices are certified safe by third parties, creating severe regulatory exposure under FTC deceptive marketing rules [measured].   

8. Cost, Capacity, and Execution Cadence
Executing synthetic probe batteries against production inference accounts requires balancing statistical power against upstream account rate limits and operating margins [measured].

8.1 Battery Call Counts and Token Consumption Modeling
The standard verification battery per model route is structured across 6 core probe vectors [measured]:   

Vector 1: Tokenizer Fingerprinting: 3 multilingual, code, and emoji inputs 
× 1 iteration = 3 API calls (600 input tokens, 15 output tokens) [measured].   

Vector 2: Canary Prompt Extraction: 2 adversarial injection probes 
× 1 iteration = 2 API calls (300 input tokens, 100 output tokens) [measured].   

Vector 3: Deterministic Canaries: 5 instruction-following prompts 
× 2 iterations = 10 API calls (1,000 input tokens, 200 output tokens) [measured].   

Vector 4: Single-Token JSD Profiling: 5 distinct prompt cells 
× 10 repeated samplings = 50 API calls (1,500 input tokens, 100 output tokens) [measured].   

Vector 5: Tool & Schema Integrity: 3 structured JSON schema probes 
× 1 iteration = 3 API calls (900 input tokens, 300 output tokens) [measured].   

Vector 6: Needle Context Boundary: 1 probe evaluated at an 8,192 token context depth = 1 API call (8,192 input tokens, 50 output tokens) [measured].   

Per-model target consumption totals: 69 API calls, 12,492 input tokens, and 765 output tokens (
≈13,257 total tokens) [measured]. The paired control runs execute simultaneously on direct vendor accounts across the discriminative subset (Vectors 1, 2, 4, and 5), consuming 55 API calls and 
≈5,200 tokens per model [measured].   

8.2 Catalog-Wide Capacity Impact (44 Models)
The operational limits of the gateway's upstream account dictate strict concurrency constraints [measured]:

Account Limits: 15 Requests Per Minute (RPM) account-wide; 20,000,000 weighted tokens per day on the free-tier quota [measured].

Target Sweep Volume: 44 models 
× 69 calls = 3,076 total API requests [measured].   

Token Volume: 44 models 
× 13,257 tokens = 583,308 total tokens [measured].   

Daily Token Quota Impact:

20,000,000
583,308
​
 ×100%=2.92% of daily token quota

A catalog-wide sweep consumes less than 3% of the gateway's daily token budget [measured].   

Rate-Limit Allocation:
Executing at 3 RPM (exactly 20% of the account-wide 15 RPM ceiling) reserves 80% (12 RPM) for real-time customer traffic [measured].
  

Execution Time= 
3 RPM
3,076 requests
​
 =1,025.3 minutes=17.09 hours

Alternatively, executing during a dedicated off-peak window (01:00 to 07:00 UTC) at 5 RPM (33% of quota) completes the entire 44-model sweep in 10.25 hours [measured].   

8.3 Financial Cost Model
Financial expenditure is calculated against actual catalog rate-cards (blended upstream cost of 
$0.80 per million input tokens and 
$2.50 per million output tokens for priced models; direct vendor control costs blended at 
$1.50 per million input tokens and 
$6.00 per million output tokens) [measured]:   

Upstream Target Cost=( 
1,000,000
44×12,492
​
 ×$0.80)+( 
1,000,000
44×765
​
 ×$2.50)=$0.4397+$0.0842=$0.5239
Direct Control API Cost=44×( 
1,000,000
5,000
​
 ×$1.50+ 
1,000,000
200
​
 ×$6.00)=44×($0.0075+$0.0012)=$0.3828
Total Cost Per Catalog Sweep=$0.5239+$0.3828=$0.9067≈$0.91
Operating on a weekly re-verification cadence across all 44 models incurs a direct API expense of 
$3.63 per month [measured].   

8.4 Tiered Scheduling Framework
To align resources with revenue risk, catalog models are scheduled across three operational cadences [recommendation]:

Catalog Tier	Model Count	Verification Cadence	Execution Profile	Triggers for Immediate Run
Tier 1: High-Volume / Priced	23 models	Every 72 hours (Off-peak)	Full 6-Vector Battery (69 queries)	Upstream route ID change; error rate spike >5%; manual operator dispatch.
Tier 2: Subscription-Only	10 models	Every 7 days (Off-peak)	Full 6-Vector Battery (69 queries)	Weekly maintenance window; upstream provider maintenance notice.
Tier 3: Free-Pool	11 models	Every 14 days (Off-peak)	Screening Battery (Vectors 1, 2, 4 only; 55 queries)	Catalog resync; upstream rate card adjustment.
9. Legal, Regulatory, and Provider Relations Framework
Publishing comparative performance and identity findings introduces immediate legal liability under advertising substantiation laws, trademark provisions, and commercial tort doctrines [measured]. The system must operate within strict legal boundaries [recommendation].   

9.1 FTC Advertising Substantiation Doctrine
Under Section 5 of the Federal Trade Commission Act (15 U.S.C. § 45) and the FTC Policy Statement on Advertising Substantiation, an advertiser must possess a "reasonable basis" for all objective product claims prior to marketing dissemination [measured]. For technical and comparative representations, a reasonable basis requires "competent and reliable scientific evidence," defined as tests, research, or studies conducted in an objective manner by qualified individuals using procedures generally accepted in the profession [measured].   

Affixing an unqualified "Verified Genuine" badge to a model whose weights cannot be examined constitutes a deceptive practice under FTC enforcement precedents [measured]. If a consumer purchases tokens expecting official frontier model execution and receives a quantized or proxy-injected variant, the reseller is liable for affirmative misrepresentation [measured]. Qualifying the claim to match the substantiation—specifically, "Verified for Tested Claims (Structural and Behavioral)" accompanied by dated methodology disclosures—strictly complies with FTC standards [recommendation].   

9.2 Lanham Act § 43(a) and Commercial Disparagement
Publishing an erroneous claim that an upstream provider is swapping models or committing fraud creates severe exposure under Section 43(a) of the Lanham Act (15 U.S.C. § 1125(a)) for false advertising and product disparagement, as well as common-law tortious interference with contractual relations [measured].   

Under Lanham Act jurisprudence, commercial disparagement requires proving that the defendant published a false or misleading statement of fact denigrating the quality of a competitor's or supplier's goods, which caused material pecuniary injury [measured]. To insulate gateway operations:   

Factual vs Accusatory Language: The system must strictly report objective test measurements rather than imputing bad faith or fraud [recommendation]. The report must state: "Observed input token accounting exceeded reference baseline by 342 tokens," never "Provider is surreptitiously injecting system instructions" [recommendation].   

Right-of-Reply Protocol: When a critical divergence is detected, public status transitions to Identity Alert: In Review [recommendation]. A 48-hour administrative hold is enforced before any public finding names upstream route anomalies, during which the upstream vendor is provided confidential notice and cryptographic test traces to explain potential infrastructure errors or silent model updates [recommendation].

9.3 Terms of Service Compliance
Frontier model providers (including OpenAI and Anthropic) maintain terms prohibiting the use of API outputs to reverse engineer internal architectures or discover proprietary weights [measured]. However, standard functional auditing—sending standard prompts to evaluate protocol conformity, instruction fidelity, and output distributions—constitutes ordinary API utilization permitted under commercial business terms [measured]. The verification daemon queries endpoints using standard HTTP parameters, adheres strictly to published rate limits, and utilizes no buffer-overflow or exploit-based payload probing [recommendation].   

10. Open-Source Inspiration Register and Architectural Reuse
To evaluate available architectural patterns without introducing incompatible licenses or architectural bloat, 10 open-source repositories spanning evaluation harnesses, fingerprinting, and security probing were audited from source [measured]:

Project	URL	License	Language	Last commit/release	Maintenance signal	What to borrow	What not to borrow	Integration cost	Recommendation
llm-fingerprint-detector	https://github.com/ToseaAI/llm-fingerprint-detector	
MIT License

TypeScript / Node	
Active (Q3 2026 commits)

Single-token sampling via Jensen-Shannon Divergence; zero-dependency TypeScript fetch client.

Heavy bundled sample reference sets; CLI file-system assumptions.

Low (Native TS / Bun compatible)	
Small Vendored Utility: Vendor core JSD math into lib/identity/stats/jsd.ts.

kvprobe	https://github.com/nickharris808/kvprobe	
Apache-2.0 License

Python	
Active (v0.2.0 released Q3 2026)

Leave-one-pair-out detector calibration; measured FPR thresholding; Merkle root evidence logging.

Python runtime requirements; local KV cache isolation testing modules.

Medium (Algorithmic port required)	
Design Reference: Adopt statistical calibration logic and thresholding design.

fpverify	https://github.com/Mohamed7415/fpverify	
MIT License

Python	
Active (Q3 2026 commits)

Anytime-valid sequential testing using martingales and e-values for early termination.

Python-specific CLI framework; unstructured output reporting.

Medium (Algorithmic port required)	
Design Reference: Port SPRT stopping boundary rules into TypeScript worker.

LLMmap	https://github.com/pasquini-dario/LLMmap	
MIT License

Python / PyTorch	
Academic Maintenance (USENIX 2025)

Inter-model discrepancy vs intra-model consistency query optimization framing.

Heavy PyTorch neural classifier dependencies; GPU requirements for trace embeddings.

High (Incompatible with light worker)	
Design Reference: Use discriminative prompt selection principles only.

Inspect AI	https://github.com/UKGovernmentBEIS/inspect_ai	
MIT License

Python	
Highly Active (UK AISI, daily commits)

Declarative task/probe registries; robust retry/backoff wrappers; structured evaluation artifacts.

Complex sandboxing subsystems (Docker/K8s/Proxmox); Python async runtime.

High (Heavy framework)	
Design Reference: Replicate declarative task schema in strict TypeScript.

LM-Evaluation-Harness	https://github.com/EleutherAI/lm-evaluation-harness	
MIT License

Python	
Highly Active (EleutherAI, 2026 releases)

Standardized prompt templating (Jinja2); loglikelihood filter structures.

PyTorch/Transformers backends; academic benchmark execution overhead.

High (Framework bloat)	
Design Reference: Study loglikelihood evaluation patterns for routes supporting logprobs.

Promptfoo	https://github.com/promptfoo/promptfoo	
MIT License

TypeScript	
Highly Active (Commercial backing, daily pushes)

Native TypeScript provider abstractions; declarative assertion matrices; red-team prompt generation.

Large CLI and web UI footprint; generic prompt-tuning features irrelevant to identity.

Medium (Dependency weight)	
Design Reference: Adopt structured assertion schemas and HTTP retry resilience.

Garak	https://github.com/leondz/garak	
Apache-2.0 License

Python	
Active (NVIDIA sponsorship, 2026 commits)

Generator-Probe-Detector-Buff modular taxonomy; specialized canary system prompt extraction probes.

Heavy red-teaming taxonomy; toxic text datasets; Python CLI coupling.

Medium (Architecture only)	
Design Reference: Port canary extraction probes into identity prompt manifests.

PyRIT	https://github.com/microsoft/PyRIT	
MIT License

Python	
Active (Microsoft AI Red Team, v1.0.1 2026)

Memory orchestrators; multi-turn attack converters for resilient probe dispatch.

Triple-model scoring overhead (attacker/target/judge); multi-turn agent complexity.

High (Overkill for black-box API)	
Design Reference: Multi-turn conversation state preservation patterns.

API-Relay-Audit	https://github.com/toby-bridges/api-relay-audit	
AGPL-3.0-only

Python	
Active (v2.5.0, Oct 2026)

Detection heuristics for proxy tool-call rewriting, SSE stream corruption, and error leakage.

AGPL-3.0 License prevents copying code into commercial services; Python curl wrappers.

Prohibited (License conflict)	
Avoid / Architecture Reference Only: Black-box threat concepts studied; zero code or direct libraries reused.

  
10.1 Savant-Code Benchmark v2 Architectural Reuse
Savant-code's existing Benchmark v2 framework contains valuable systems patterns that can be cleanly separated from its coding-agent dependencies [recommendation]:

Reusable Patterns: The declarative task schema, paired-trial execution discipline, sequential state tracking, structured JSON artifact generation, and the pass^k reliability formulation are directly applicable to model provenance evaluation [recommendation].

Specific Rejections: The coding agent execution harness, Docker/temp-dir file-system sandboxing, git repository mutations, bash compilation/lint runners, and complex multi-agent FSM transition raters are completely irrelevant to black-box HTTP probing and must not be imported [recommendation].

Architectural Separation: The gateway implements a bespoke, lightweight TypeScript library (packages/identity-core) matching the gateway's strict quality standards (sub-400-line modular files, zero lint warnings, full strict-mode typing) rather than attempting a monolithic port of savant-code [recommendation].

11. Implementation Roadmap and Acceptance Criteria
The system rollout progresses through six sequential, dependency-ordered milestones, ensuring that no schema mutations or public disclosures occur without prior validation of detector calibration [recommendation]:

Milestone 1: Storage Architecture and Worker Foundation. This initial stage delivers the managed Postgres migration script applying the identity.* schema tables, indexes, and connection roles, alongside the initialization of the standalone apps/identity-worker service skeleton equipped with rate-limiting throttles and graceful shutdown handling. Acceptance requires demonstrating zero table locks or schema dependencies on production billing tables (ledger_entries, billing_holds), proving that 100 concurrent billing admissions execute unaffected during a connection-pool saturation stress test, and passing npm run verify with zero TypeScript errors and zero lint warnings.

Milestone 2: Tokenizer Invariant and Canary Extraction Battery. This phase delivers packages/identity-core containing local tokenizer drivers (tiktoken and Hugging Face BPE wrappers) alongside execution harnesses for Vector 1 (Tokenizer Invariant) and Vector 2 (Canary System Prompt Extraction). Acceptance requires proving that the local tokenizer computes exact prompt token length across 10 multilingual fixtures with zero token variance against direct vendor ground truth, and verifying that canary extraction probes extract injected system prompts in 100% of synthetic test proxies configured with hidden instructions.

Milestone 3: Single-Token JSD and Sequential Testing Engine. This milestone delivers Vector 4 (Single-token behavioral distribution profiling), the SPRT sequential stopping engine, and the Benjamini-Hochberg FDR correction pipeline. Acceptance requires verifying that JSD calculations on identical model completions across 50 samples evaluate to 
D 
JS
​
 ≤0.08, that cross-model comparisons (such as Llama-3.1-8B versus Llama-3.1-70B) produce 
D 
JS
​
 ≥0.35 with rejection of the null hypothesis at 
p<0.001, and that the SPRT engine halts execution on blatant substitutions in 4 or fewer queries.

Milestone 4: Dual Controls Registry and Detector Calibration Drill. This stage establishes direct vendor API control accounts, implements dual-control execution logic (same-model and different-model arms), and executes a complete leave-one-pair-out calibration drill. Acceptance requires completing the calibration drill across 5 self-hosted control arms with a measured false-positive rate 
≤0.01 and zero tie-forced results, while achieving 100% detection recall across the historical 2026-09-13 audit regression cases.

Milestone 5: Admin Review Console and Quarantine Gates. This operational milestone introduces the internal admin dashboard (/admin/identity) surfacing active sweeps, real-time finding feeds, incident queues, and manual quarantine controls, alongside automated soft-quarantine routing triggers. Acceptance requires confirming that simulated divergence automatically flags the target route as mismatch_under_review and opens a critical incident within 500ms of run completion, and proving that soft-quarantine successfully demotes the route from default customer catalog views while preserving active streaming sessions.

Milestone 6: Public Methodology and Model-Page Panel Launch. The final rollout phase deploys the /models/[id] identity panel, publishes the public methodology documentation (/methodology/provenance) detailing probe manifests and mathematical definitions, and activates the read-only projection cache refresh pipeline. Acceptance requires demonstrating that the denormalized projection cache (identity.public_model_projections) resolves queries in under 5ms without accessing the identity worker database, verifying that the model page cleanly renders all 5 operational states with appropriate disclaimers, and obtaining formal legal sign-off on public substantiation phrasing.

Prior to displaying the first public verification badge, the system must achieve measured FPR 
≤0.01 across a 10-arm control calibration drill, complete 100% probe battery coverage on the target route, and establish an active same-model control with less than 14 days of age [recommendation]. Initiating an automated soft-quarantine requires that a detected divergence exceed the Bonferroni/FDR threshold (
p<0.001) and be corroborated across at least two distinct probe vectors [recommendation]. Public methodology reproducibility requires providing downloadable, SHA-256 hashed probe manifests and open-source verification scripts allowing any third party to reproduce findings against their own endpoints [recommendation].

The operator must delay or cancel the public launch if the upstream provider enforces aggressive server-side caching that collapses sampling entropy across repeated queries, if direct vendor control API expenses exceed 5% of monthly recurring gross margin, or if legal counsel determines that publishing scoped consistency findings exposes the gateway to Lanham Act discovery burdens [recommendation].

12. Operational Metrics and Decision Framework
The identity system operates under continuous quantitative monitoring to track detector accuracy, resource overhead, and review responsiveness [recommendation]:

Operational Metric	Target Threshold	Critical Alert Trigger	Remediation Protocol
Detector False Positive Rate (FPR)	
≤1.0%

≥2.5% on Control Arms	
Suspend automated mismatch flagging; re-run leave-one-pair-out calibration drill on reference models.

Detector Power (
1−β)	
≥95% on Swaps

<90% on Labeled Test Corpus	
Expand probe cell counts (
K≥8) or increase repeat sampling per prompt cell (
N≥15).

Catalog Audit Coverage	
100% Active Routes	
<95% of Catalog Audited in 14d	Increase worker execution budget or promote un-audited routes to high-priority queue.
Verification Freshness SLA	
≤7 days (Priced Tiers)	
>14 days on Any Live Route	Route automatically transitions to stale; worker preempts low-tier queues.
Upstream RPM Consumption	
≤20% (3 RPM)

≥33% (5 RPM) during Peak Hours	
Throttler hard-caps identity requests to prevent impacting customer traffic.

Operator Review Turnaround SLA	
<4 hours (Critical Alert)	
>12 hours Unresolved Incident	Automatically trigger soft-quarantine on affected route until operator signs off.
Public Correction Rate	
0.0% Retractions	
≥1 Retraction per Quarter	Conduct formal incident review; tighten discovery threshold 
q 
∗
  in Benjamini-Hochberg engine.
  
Operational actions proceed through a deterministic verification lifecycle across four structured decision states [recommendation]:

When a scheduled sweep completes with a verified_for_tested_claims verdict, the worker automatically refreshes identity.public_model_projections, updates the verification timestamp, and maintains normal catalog routing [recommendation].

When a sweep produces an inconclusive determination—resulting from upstream timeout spikes, network transport failures, or control baseline drift—the public model card transitions to Identity Inconclusive with an explanatory tooltip, standard commercial routing is maintained, and an automated low-priority notification instructs the operator to inspect control endpoint validity [recommendation].

When a sweep identifies statistically significant divergence across multiple vectors resulting in a mismatch_under_review verdict, the public model projection transitions immediately to Identity Alert: In Review, hiding the route from default catalog listings and disabling purchase calls for new sessions while preserving in-flight streaming connections [recommendation]. A high-severity incident is posted to /admin/identity, and a 48-hour administrative notification window begins to permit upstream provider review prior to public finding publication [recommendation].

If human administrative review confirms that the mismatch represents a legitimate upstream checkpoint update or harmless formatting modification, the operator updates baseline manifests and clears the incident; if unauthorized model substitution or severe degradation is confirmed, the model is permanently de-listed from the gateway catalog and an entry is logged in the public methodology correction ledger [recommendation].

13. Anti-Patterns and Prohibited Implementations
To ensure operational stability and legal defensibility, five specific architectural anti-patterns are strictly prohibited from implementation [recommendation]:

The Monolithic Composite Trust Score: Attempting to compress tokenizer deltas, divergence metrics, latency statistics, and capability scores into a single numeric scalar (such as an "Authenticity Score: 94/100") is uninterpretable, mathematically indefensible, and vulnerable to gaming [measured]. The system must emit discrete, orthogonal categorical findings [recommendation].

In-Line Admission Verification Blocking: Intercepting live customer requests to execute synchronous identity probes introduces latency jitter, consumes customer token quotas, and introduces catastrophic single-point failures into the revenue path [measured]. Identity verification must execute strictly out-of-band via asynchronous background workers [recommendation].

Heuristic Token Accounting (characters / 4): Approximating token lengths via character division fails catastrophically on code, non-Latin scripts (Chinese, Japanese, Arabic), and JSON payloads, generating false-positive ratios as high as 3.5:1 on entirely honest endpoints [measured]. All tokenizer invariant checks must run exact BPE tokenizer binaries locally [recommendation].

Automated Hard De-Listing without Human Sign-Off: Allowing an automated statistical test to instantly delete or hard-block a live production route without operator review exposes the business to self-inflicted denial-of-service outages caused by transient upstream network anomalies [measured]. Divergence triggers soft-quarantine and human escalation; hard de-listing requires human administrator approval [recommendation].

Storing Unredacted Customer or Provider Secrets: Logging raw Authorization headers, upstream API keys, or raw chat completions containing customer payloads in verification databases violates data privacy mandates and risks secret leakage [measured]. All evidence stores must run mandatory one-way hashing and credential redaction prior to disk serialization [recommendation].

14. Key Decisions for System Ownership
Four structural decisions require explicit determination by the platform operator prior to code deployment [recommendation]:

Decision 1: Public Action Policy for Route Divergence. When an active model route exhibits statistical mismatch, should the public model page immediately display an amber Identity Alert: In Review badge (maximizing transparency at the risk of upstream friction), or should the route silently fail over to an alternative upstream provider for 24 hours while an internal investigation occurs? Recommendation: Implement automated soft-quarantine accompanied by the amber review badge to maintain regulatory substantiation compliance.

Decision 2: Control Endpoint Budget Authorization. Operating dual controls requires maintaining active direct accounts with OpenAI, Anthropic, and DeepSeek, incurring approximately $15.00 to $25.00 monthly in base access and verification queries. Does the operator authorize maintaining funded direct accounts strictly for control baseline verification? Recommendation: Authorize a $50.00/month recurring control budget; independent controls are legally required to defeat circularity.

Decision 3: Scope of Initial Public Badges. Should the gateway launch public badges across all 44 models simultaneously, or launch exclusively on the 11 free-pool models during Phase 1? Recommendation: Restrict Phase 1 badges to the 11 free-pool routes to calibrate the detector on live infrastructure before publishing findings on paid customer routes.

Decision 4: Publication Policy for Third-Party Gateways. Does the operator intend to use this system strictly to verify its own catalog, or to publish comparative audit reports evaluating external competitor gateways (as done in the 2026-09-13 audit)? Recommendation: Confine public badges strictly to first-party gateway routes. Publishing comparative named audits of competitors creates significant Lanham Act litigation risks that require specialized legal defense reserves.

15. Epistemic Boundary and Falsifiability
A scientific evaluation harness must articulate the empirical conditions under which its foundational assumptions would be invalidated [recommendation]:

Hardware and Speculative Non-Determinism: If future inference runtimes adopt dynamic speculative decoding across distributed, heterogeneous GPU/NPU clusters that alter top-1 output probabilities at 
T=0, the intra-model stability assumption (
E[D 
JS
​
 ]≤0.08) would be broken [assumption]. In such an environment, behavioral divergence thresholds would need to expand, shifting reliance almost entirely toward tokenizer invariants and canary injections [recommendation].

Universal Upstream Context Virtualization: If upstream providers introduce universal middleboxes that dynamically compress system prompts and strip special tokens while preserving model behavior, tokenizer token-inflation checks would become unreliable [assumption]. The system would then require dynamic multi-turn activation watermarks rather than static token count checks [recommendation].

Zero-Knowledge Hardware Attestation: If major cloud providers implement universally accessible cryptographic attestation (such as AMD SEV-SNP or NVIDIA H100 Confidential Computing quotes signed by hardware manufacturers verifying model weights and memory digests), black-box statistical fingerprinting would become obsolete [assumption]. The gateway would immediately retire empirical probe batteries in favor of direct hardware certificate verification [recommendation].   

