import { CORS_HEADERS } from "@/lib/http";
import { guardModelRead, openAiModelObject } from "@/lib/openai-model";
import { listModels } from "@/lib/store-facade/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await guardModelRead(request);

  if (denied) return denied;

  const models = await listModels();
  const data = await Promise.all(models.map(openAiModelObject));

  return Response.json({ object: "list", data }, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
