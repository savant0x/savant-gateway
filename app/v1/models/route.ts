import { siteConfig } from "@/config/site";
import { CORS_HEADERS, extractApiKey, jsonError } from "@/lib/http";
import { authenticateApiKey, listModels } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = extractApiKey(request);

  if (!secret) {
    return jsonError(
      401,
      "Missing API key (Bearer or x-api-key)",
      "authentication_error",
    );
  }

  if (!authenticateApiKey(secret)) {
    return jsonError(401, "Invalid API key", "authentication_error");
  }

  const data = listModels().map((model) => ({
    id: model.id,
    object: "model",
    owned_by: siteConfig.provider.slug,
    name: model.name,
    family: model.family,
    group: model.access,
    context_window: model.contextWindow,
    token_weight: model.tokenWeight,
    allow_free: model.allowFree,
    input_price_per_1m: model.inputPricePer1M,
    output_price_per_1m: model.outputPricePer1M,
    currency: "usd",
    supports_tools: model.supportsTools,
    supports_vision: model.supportsVision,
    health: model.health,
  }));

  return Response.json({ object: "list", data }, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
