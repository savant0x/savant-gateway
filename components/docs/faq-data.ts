export type FaqItem = {
  question: string;
  answer: string;
  link?: { href: string; label: string };
};

export type FaqGroup = {
  id: string;
  title: string;
  items: FaqItem[];
};

export const FAQ_GROUPS: FaqGroup[] = [
  {
    id: "start",
    title: "Start here",
    items: [
      {
        question: "What is Savant Gateway?",
        answer:
          "It is an independent inference gateway: one OpenAI-compatible Chat Completions endpoint over several upstream model families. It owns the account, key, catalog, prepaid credit, usage ledger and operator console, so you do not manage an upstream provider account yourself. This deployment is pre-launch: plans are not on sale, and there is no uptime guarantee.",
        link: { href: "/docs/start", label: "Read the newcomer guide" },
      },
      {
        question: "Do I need credit to make a first request?",
        answer:
          "No, if you choose a model in the free-pool group. You still need an account and an active key. Free-pool calls are metered in weighted tokens against a shared daily allowance, so they can be unavailable when the pool is exhausted. Paid models require prepaid credit; subscription models require a plan that includes them, and plans are not currently sold.",
      },
      {
        question: "How do I get an API key?",
        answer:
          "Create an account at /signup, accept the current policies, then open /account and create a key. The secret is shown once; only a hash is stored after that. Send it as a Bearer token or in x-api-key on every /v1 request.",
        link: { href: "/signup", label: "Create an account" },
      },
      {
        question: "How do I rotate or revoke a key?",
        answer:
          "Create a second key on /account, move your traffic to it, then revoke the first. Revocation is immediate: requests using that key stop working. A secret cannot be recovered after creation, so a lost key is replaced, not reset. An account may hold 10 active keys and create 20 keys per hour; revoking one does not reset the hourly issuance limit.",
        link: { href: "/account", label: "Manage your keys" },
      },
      {
        question: "Can I use the OpenAI SDK I already have?",
        answer:
          "Yes, for Chat Completions. Set the client base URL to your gateway origin plus /v1 and use your Savant key as the API key. Pointing an OpenAI client at this gateway does not add the Responses API or native provider features; only the documented Chat Completions surface is implemented.",
        link: { href: "/docs/start", label: "See the SDK example" },
      },
      {
        question: "Which models can I call?",
        answer:
          "Available models span multiple families and can include OpenAI GPT and Anthropic Claude. Use an id from GET /v1/models or /models with the OpenAI-compatible Chat Completions API. Availability changes with provider routes and pricing; a listing does not guarantee your account has the required credit or subscription.",
        link: { href: "/models", label: "Browse the catalog" },
      },
    ],
  },
  {
    id: "free",
    title: "Free access",
    items: [
      {
        question: "How does free access work?",
        answer:
          "Free access is a separate catalog SKU, not a discount on a paid model: the free row has its own id and a name ending in “(Free)”. You need an account and an active scoped key to use it; in daily mode the split counts only activated accounts with an active key. When daily allocation is enabled, an activated account receives a daily share of weighted tokens that resets at 00:00 UTC and does not carry over. If the operator has enabled the one-time trial instead, the grant is a single balance that does not reset. Either way, every free model draws on that one balance at its own token weight. It is a share of shared upstream capacity, not a guaranteed quota: a missing or stale capacity observation, a provider that disallows free usage, or a pool near its safety floor makes the gateway refuse free-pool calls rather than overdraw the pool. Free-pool admission does not debit prepaid credit, but an active plan that includes the model applies its included or overage policy first, and a one-time trial can fall back to its configured paid pair when the trial cannot cover a request.",
        link: { href: "/models", label: "Browse the free SKUs" },
      },
      {
        question: "Where do I see my free balance and how do I start?",
        answer:
          "Open a free SKU's detail page from /models. It shows the current daily allocation or one-time trial balance, the model's weight, the raw-token equivalent, the reset or last-check context, a free-allocation FAQ and a copyable Chat Completions request. The account page shows the matching daily or one-time balance card, holds your scoped keys and usage table, and the daily card can request a fresh upstream check. Create the key on the account page first; a free model cannot be called with an inactive or missing key. If the detail page says capacity is unavailable, no new free-pool call is admitted until a fresh observation succeeds.",
        link: { href: "/account", label: "Check your balance" },
      },
    ],
  },
  {
    id: "models",
    title: "Models and pricing",
    items: [
      {
        question: "What do free, paid and subscription mean?",
        answer:
          "The group field is the billing class. Free means zero charge, metered against the shared weighted pool. Paid debits prepaid credit at the listed sell price after settlement. Subscription is covered by a purchased plan snapshot; without a plan that includes the model, the call is refused with 403 subscription_required. The group is authoritative; the upstream model's free capability does not override it.",
        link: { href: "/docs#identity", label: "Read the vocabulary" },
      },
      {
        question: "What is a weighted token?",
        answer:
          "It is the upstream accounting unit for free and plan allowances. A model with weight 3 consumes three weighted tokens for each raw token. Free-pool and plan usage is metered in weighted tokens; paid rows are priced in US dollars per 1M raw input or output tokens. Your account page shows the remaining allowance and the reset time.",
      },
      {
        question: "Why is a price shown as zero?",
        answer:
          "A zero price usually means the row belongs to a free-pool or subscription group, where a per-token dollar price would be misleading. Read the group before treating zero as unlimited: free usage still has a shared daily allowance, and a plan-only row still needs a subscription. A paid row with no sell price is unavailable, not free.",
      },
      {
        question: "Why did a model disappear from the catalog?",
        answer:
          "A provider sync marks a vanished row as delisted rather than deleting it, so its prices, usage and history remain. The model also becomes unavailable if its provider is disabled, its row is manually disabled, or a paid row loses its sell price. There is no automatic failover to another provider.",
      },
      {
        question:
          "Do you support the Anthropic Messages or OpenAI Responses API?",
        answer:
          "Claude models can be called when they appear in the catalog, using the OpenAI-compatible Chat Completions API. The native Anthropic Messages and OpenAI Responses APIs are not exposed: /v1/messages and /v1/responses are not implemented. Some upstream providers use Anthropic Messages internally, which the gateway translates. Anthropic-native and Responses-native clients cannot use those native endpoints here. Embeddings, image generation, audio and batch endpoints are also absent.",
        link: { href: "/docs#chat", label: "Read the chat contract" },
      },
      {
        question: "Do tools and vision work?",
        answer:
          "Only when the selected model advertises the capability. The model object exposes supports_tools and supports_vision. Tool definitions and image content are forwarded in the OpenAI shape; the gateway does not reject a payload based on those flags, so a model without the flag is unsupported and the upstream may fail. Check the row before building the feature around it.",
        link: { href: "/docs#model-fields", label: "Read the model fields" },
      },
    ],
  },
  {
    id: "billing",
    title: "Credit and billing",
    items: [
      {
        question: "When does a paid request charge me?",
        answer:
          "A paid call reserves an estimated hold before dispatch. When the response finishes, fails or the stream closes, one settlement transaction releases the hold and debits the actual charge. Free calls do not touch credit, and included subscription usage does not debit credit; an exhausted plan follows its block or credit-overage policy.",
        link: { href: "/docs#chat", label: "Read the request flow" },
      },
      {
        question: "What is a hold, and why is available credit lower?",
        answer:
          "A hold is admission control for a request that is still in flight. Available credit is the balance minus those holds, so it can be lower than the balance while calls are running. A completed request releases its hold and debits the actual charge. A failed request that has not settled can leave a hold visible for reconciliation.",
      },
      {
        question: "Can my balance go negative?",
        answer:
          "Yes. A hold is an estimate, not a ceiling; if the provider reports more usage than estimated, the actual debit can exceed it and leave a negative balance. Paid calls are then refused with 402 until the account is funded. The gateway records the real charge instead of silently clamping the balance to zero.",
      },
      {
        question: "How do top-ups work?",
        answer:
          "When the operator has configured Stripe, the Add credit card on /account opens Stripe Checkout for $5 to $500, in whole cents, with $10, $25, $50 and $100 presets. The app never sees card data, and a successful redirect alone grants nothing: credit is written only after a signed Stripe webhook confirms the payment. If payments are not configured, the top-up endpoint returns 503 and invents no credit.",
        link: { href: "/account", label: "Open your account" },
      },
      {
        question: "Do credits expire, and can I get a refund?",
        answer:
          "Prepaid credit has no expiry and no inactivity fee. Refunds are not automatic: a duplicate or erroneous charge, an unauthorized charge, or a legally required refund is handled through support, and the operator may use discretion. Consumed credit is not refundable. Card refunds are manual Stripe actions, not an automated button in this app.",
        link: { href: "/refunds", label: "Read the refund policy" },
      },
      {
        question: "Can I buy a subscription plan?",
        answer:
          "Not during this launch. Plans can be authored and existing comped or previously purchased subscriptions remain honored, but new plan sales are disabled and the public plan catalog stays empty. Changing that is an offering decision, not a checkout setting.",
        link: { href: "/plans", label: "See the plan status" },
      },
      {
        question: "Is my payment information safe?",
        answer:
          "Card details are entered on Stripe's hosted page and are never sent to this application. The gateway stores a provider reference, amount and fulfilment state, and credits the account only from a signed webhook with a matching amount and currency. A replayed event is acknowledged without crediting twice.",
      },
    ],
  },
  {
    id: "errors",
    title: "Errors and limits",
    items: [
      {
        question: "Why did I get a 401?",
        answer:
          "The request had no key, a malformed key, a revoked key, or a key belonging to an inactive account. Send Authorization: Bearer sk-... or x-api-key: sk-... and confirm the key is still listed as active on /account. A key secret cannot be recovered after creation; create a new one if it was lost.",
      },
      {
        question: "Why did I get a 402 or 403?",
        answer:
          "402 means the request cannot be covered: insufficient credit, a past-due subscription, or an exhausted allowance under a block policy. 403 subscription_required means the model is plan-only and no active plan snapshot includes it. Choose a free or paid row, or resolve the account state.",
      },
      {
        question: "Why did I get a 429?",
        answer:
          "A rate limit is active. Free traffic shares one bucket across every key and is bounded below the upstream account ceiling; paid traffic shares one bucket per account across its keys. Read the Retry-After header and wait before retrying. A busy shared free pool is a capacity signal, not a key problem.",
      },
      {
        question: "Why did I get a 502 or 503?",
        answer:
          "502 means the upstream provider failed or returned an invalid response. 503 means the model is unpriced, disabled or unavailable, or the shared pool is not admitting calls. Retry with backoff, or choose another model. There is no automatic rerouting to a different provider.",
      },
      {
        question: "Why did my stream fail after producing text?",
        answer:
          "A stream can carry partial text and then fail on an upstream error, a client disconnect or a settlement failure. The gateway attempts accounting on close; when settlement fails it withholds the terminal [DONE] and reports the failure instead of pretending the stream succeeded. Treat that response as failed and check the usage ledger before retrying a paid call.",
      },
      {
        question: "Do you retry a failed provider request automatically?",
        answer:
          "No. Each model has exactly one serving provider, and the gateway does not silently reroute or replay a completion. A client can retry with backoff, but a paid request is not idempotent: after partial output, check the account usage before sending it again so a settled charge is not duplicated.",
      },
      {
        question: "What are the output-token limits?",
        answer:
          "The gateway defaults max_tokens to 4,096. Supplied max_tokens and max_completion_tokens must each be integers from 1 to 65,536; max_completion_tokens takes precedence when both are valid. Only n=1 is supported. Inference bodies are limited to 2 MiB, with at most 256 messages and 128 tools. The model's context window is informational; the provider still enforces its own limits and can return an upstream error.",
        link: { href: "/docs#chat", label: "Read the request fields" },
      },
    ],
  },
  {
    id: "account",
    title: "Account, privacy and support",
    items: [
      {
        question: "Where do I see usage and the ledger?",
        answer:
          "The account page shows balance, held credit, keys, usage rows and the credit ledger. Usage records the settled charge and upstream cost separately; the ledger records money moving in and out of the balance. If a support request is resolved, the operator's note appears on that request in the same account view.",
        link: { href: "/account", label: "Open your account" },
      },
      {
        question: "Are my prompts and outputs stored?",
        answer:
          "Not as content. The gateway records the model, token counts, charge, latency, redacted error text and timestamps in a usage row, but does not store the request body or the completion. The selected upstream provider receives the content and handles it under its own terms.",
        link: { href: "/privacy", label: "Read the privacy notice" },
      },
      {
        question: "How do I request deletion of my data?",
        answer:
          "Send a data-deletion request from the support card on your signed-in account. The request is recorded against the account; deletion is a manual operator action, not a self-service button. Usage events are retained with the account link removed for billing and audit integrity, as the privacy notice describes.",
        link: { href: "/privacy", label: "Read the privacy notice" },
      },
      {
        question: "Do you send email?",
        answer:
          "Email verification and password reset are available when the operator configures account email delivery. Request verification from /account or a password reset from /recover. Links expire and work once; requesting a newer link invalidates the earlier one. Password reset revokes all sessions and API keys. When delivery is not configured, those screens state that it is unavailable. Support remains an authenticated queue; read its resolution note on /account.",
        link: { href: "/support", label: "Read about support" },
      },
      {
        question: "What are the log and backup retention windows?",
        answer:
          "The privacy notice states that hosting logs are retained for up to 30 days and database backups for up to 30 days. A deletion is not immediately propagated into existing backups. The current policy version is v1.1; older versions remain readable at their permanent legal routes.",
        link: { href: "/privacy", label: "Read the retention section" },
      },
      {
        question: "Is there an SLA or uptime commitment?",
        answer:
          "No. This is a pre-launch deployment with no uptime guarantee or service-level credit. A deployment or host failure can cause downtime. /api/health reports liveness and /api/ready reports whether configuration and storage can serve.",
        link: { href: "/terms", label: "Read the terms" },
      },
      {
        question: "How do I report a security issue?",
        answer:
          "Do not put credentials, customer keys, prompts or payment details in a public issue. Use the support queue from your signed-in account for an account-specific concern; the repository's SECURITY.md describes the private reporting path for the codebase.",
        link: { href: "/support", label: "Open support" },
      },
    ],
  },
];
