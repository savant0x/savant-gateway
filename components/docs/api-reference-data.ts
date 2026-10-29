import { siteConfig } from "@/config/site";

export const NAV_ITEMS = [
  { href: "#identity", label: "Vocabulary" },
  { href: "#authentication", label: "Authentication" },
  { href: "#models", label: "List models" },
  { href: "#model-fields", label: "Model fields" },
  { href: "#chat", label: "Chat completions" },
  { href: "#errors", label: "Errors" },
] as const;

export const IDENTITIES = [
  {
    label: "Provider",
    value: siteConfig.provider.name,
    detail:
      'The service serving the request. The API exposes it as owned_by: "savant-gateway".',
  },
  {
    label: "Family",
    value: "GPT · Claude · DeepSeek · …",
    detail: "The upstream model line. Family never describes price or access.",
  },
  {
    label: "Price group",
    value: "free · paid · subscription",
    detail:
      "The billing class. This is the group field and the authoritative access signal.",
  },
] as const;

export const MODEL_FIELDS = [
  {
    name: "id",
    type: "string",
    description: "Public model id. Send this value as model in a completion.",
    example: "gpt-6.1-sol",
  },
  {
    name: "object",
    type: '"model"',
    description: "Object type. Always model.",
    example: "model",
  },
  {
    name: "owned_by",
    type: "string",
    description:
      "Provider identity. Always savant-gateway; not a family or price group.",
    example: "savant-gateway",
  },
  {
    name: "name",
    type: "string",
    description: "Human-readable display name.",
    example: "Gpt 6.1 Sol",
  },
  {
    name: "family",
    type: "string",
    description:
      "Model line, such as GPT, Claude, DeepSeek, Gemini, GLM, Kimi, or Grok.",
    example: "GPT",
  },
  {
    name: "group",
    type: "free | paid | subscription",
    description:
      "Billing mode of the assigned group. Read this field before routing or budgeting.",
    example: "paid",
  },
  {
    name: "group_slug",
    type: "string",
    description:
      "Stable slug of the assigned group, including operator-created groups.",
    example: "resale",
  },
  {
    name: "group_label",
    type: "string",
    description: "Operator-facing label for the assigned group.",
    example: "Resale",
  },
  {
    name: "group_billing_mode",
    type: "free | paid | subscription",
    description: "Billing mode, duplicated additively for group-aware clients.",
    example: "paid",
  },
  {
    name: "context_window",
    type: "string",
    description: "Provider context notation. Treat it as informational.",
    example: "1M",
  },
  {
    name: "token_weight",
    type: "integer",
    description:
      "Metering weight in a free-billing group. Zero for paid and subscription groups.",
    example: "0",
  },
  {
    name: "allow_free",
    type: "boolean",
    description:
      "Upstream free-pool capability. It selects the default group during sync; the assigned group decides billing.",
    example: "false",
  },
  {
    name: "input_price_per_1m",
    type: "number",
    description:
      "Our sell price in USD per 1M input tokens. Zero for free and unpriced rows.",
    example: "0.4",
  },
  {
    name: "output_price_per_1m",
    type: "number",
    description:
      "Our sell price in USD per 1M output tokens. Upstream cost is never exposed.",
    example: "0.6",
  },
  {
    name: "currency",
    type: '"usd"',
    description: "Currency for both sell prices.",
    example: "usd",
  },
  {
    name: "supports_tools",
    type: "boolean",
    description: "Whether the model accepts tool definitions.",
    example: "true",
  },
  {
    name: "supports_vision",
    type: "boolean",
    description: "Whether the model accepts image content.",
    example: "true",
  },
  {
    name: "health",
    type: "string | null",
    description:
      "Provider-reported health label. Informational; routing still checks group and price.",
    example: "live",
  },
] as const;

export const REQUEST_FIELDS = [
  {
    name: "model",
    type: "string",
    description: "Required. A public id from GET /v1/models.",
    example: "gpt-6.1-sol",
  },
  {
    name: "messages",
    type: "array",
    description:
      "Required, non-empty. OpenAI-style objects with role and content.",
    example: '[{ role: "user", content: "Hello" }]',
  },
  {
    name: "stream",
    type: "boolean",
    description:
      "Optional. When true the response is text/event-stream instead of JSON.",
    example: "false",
  },
  {
    name: "max_tokens",
    type: "integer",
    description:
      "Optional. Paid calls default to 4,096 and reject values above 65,536; free-pool calls forward it upstream.",
    example: "512",
  },
  {
    name: "max_completion_tokens",
    type: "integer",
    description:
      "Optional. Takes precedence over max_tokens when both are present.",
    example: "512",
  },
  {
    name: "tools",
    type: "array",
    description: "Optional. Forwarded unchanged when the model supports tools.",
    example: "[…]",
  },
  {
    name: "temperature, top_p, …",
    type: "OpenAI-compatible",
    description:
      "Other sampling and response fields are forwarded to the provider unchanged.",
    example: "0.7",
  },
] as const;

export const GROUPS = [
  {
    group: "free",
    billing: "Zero charge. Metered in the provider's weighted units.",
    routing: "Available without credit in any free-billing group.",
  },
  {
    group: "paid",
    billing:
      "Debits prepaid account credit at the listed sell price after settlement.",
    routing: "Requires a sell price and available credit.",
  },
  {
    group: "subscription",
    billing:
      "Visible for discovery. Upstream entitlement may be required before a call can route.",
    routing:
      "Requires an upstream entitlement and a sell price; unpriced rows return 503.",
  },
] as const;

export const ERRORS = [
  {
    status: "400",
    type: "invalid_request_error",
    meaning:
      "Invalid JSON, missing model, empty messages, or an over-limit output budget.",
  },
  {
    status: "401",
    type: "authentication_error",
    meaning: "Missing or invalid API key. Send Bearer or x-api-key.",
  },
  {
    status: "402",
    type: "insufficient_quota",
    meaning:
      "The account's available credit cannot cover the paid request's hold.",
  },
  {
    status: "404",
    type: "model_not_found",
    meaning: "The model id is not in the public catalog.",
  },
  {
    status: "503",
    type: "model_unpriced | model_unavailable",
    meaning: "The row has no sell price or is disabled upstream.",
  },
  {
    status: "502",
    type: "upstream_error",
    meaning: "The provider failed or returned an invalid response.",
  },
] as const;

export const MODELS_RESPONSE = `{
  "object": "list",
  "data": [
    {
      "id": "gpt-6.1-sol",
      "object": "model",
      "owned_by": "savant-gateway",
      "name": "Gpt 6.1 Sol",
      "family": "GPT",
      "group": "paid",
      "group_slug": "paid",
      "group_label": "Paid",
      "group_billing_mode": "paid",
      "context_window": "1M",
      "token_weight": 0,
      "allow_free": false,
      "input_price_per_1m": 0.4,
      "output_price_per_1m": 0.6,
      "currency": "usd",
      "supports_tools": true,
      "supports_vision": true,
      "health": "live"
    },
    {
      "id": "free/gpt-6-luna",
      "object": "model",
      "owned_by": "savant-gateway",
      "name": "Gpt 6 Luna",
      "family": "GPT",
      "group": "free",
      "group_slug": "free",
      "group_label": "Free",
      "group_billing_mode": "free",
      "context_window": "1M",
      "token_weight": 3,
      "allow_free": true,
      "input_price_per_1m": 0,
      "output_price_per_1m": 0,
      "currency": "usd",
      "supports_tools": true,
      "supports_vision": true,
      "health": "live"
    }
  ]
}`;

export const MODELS_REQUEST = `curl "$GATEWAY_URL/v1/models" \\
  -H "Authorization: Bearer sk-..."`;

export const CHAT_REQUEST = `curl "$GATEWAY_URL/v1/chat/completions" \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-6.1-sol",
    "messages": [{ "role": "user", "content": "Hello" }],
    "max_tokens": 512,
    "stream": false
  }'`;

export const CHAT_RESPONSE = `{
  "id": "chatcmpl_...",
  "object": "chat.completion",
  "model": "gpt-6.1-sol",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Hello." },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 2,
    "total_tokens": 14
  }
}`;

export const ERROR_RESPONSE = `{
  "error": {
    "message": "Insufficient credit balance for this request.",
    "type": "insufficient_quota",
    "param": null,
    "code": null
  }
}`;

export type Field = {
  name: string;
  type: string;
  description: string;
  example: string;
};
