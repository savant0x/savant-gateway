import { handleChatCompletions } from "@/lib/storage/gateway/call.ts";
import { CORS_HEADERS } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The live entry is the ported one (FID-086, step 4 cutover). It was held back
 * until the readers and the provider writers moved, because a gateway alone on
 * PostgreSQL would answer `model_not_found` against an empty catalog.
 */
export async function POST(request: Request) {
  return handleChatCompletions(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
