import { CORS_HEADERS } from "@/lib/http";
import {
  findPublishedModel,
  guardModelRead,
  modelNotFound,
  openAiModelObject,
} from "@/lib/openai-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string[] }> };

/**
 * `GET /v1/models/{id}` (FID-2026-1103-124). The catch-all segment accepts an
 * encoded or literal slash because published ids are `provider/model`. The
 * lookup runs over the same published projection as the list, so a disabled
 * model, a model behind a disabled provider, or an unpublished row is a 404
 * rather than a leaked catalog entry.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const denied = await guardModelRead(request);

  if (denied) return denied;

  const id = (await params).id.join("/");
  const model = await findPublishedModel(id);

  if (!model) return modelNotFound(id);

  return Response.json(await openAiModelObject(model), {
    headers: CORS_HEADERS,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
