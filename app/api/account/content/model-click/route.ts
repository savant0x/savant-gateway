import { getItem } from "@/lib/content/store/items";
import { customerError, requireCustomerApi } from "@/lib/customer-auth";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getPublishedModel } from "@/lib/storage/store/catalog.ts";
import { getDatabase } from "@/lib/storage/runtime";
import { recordActivityBestEffort } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const contentId =
    typeof body.contentId === "string" ? body.contentId.trim() : "";
  const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";

  if (!contentId || !modelId) {
    return customerError(400, "contentId and modelId are required.");
  }

  if (contentId.length > 200 || modelId.length > 200) {
    return customerError(400, "contentId and modelId are too long.");
  }

  const db = await getDatabase();
  const item = await getItem(db, contentId);

  if (!item) return customerError(404, "That content item does not exist.");

  // The page sends the id it displays, so the stored key is resolved here rather
  // than published to the browser (FID-2026-1125-002). The funnel row keeps the
  // stored key, because that is what the rest of the content ledger references.
  const model = await getPublishedModel(db, modelId);

  if (!model) return customerError(404, "That model is not in the catalog.");

  await recordActivityBestEffort({
    userId: customer.id,
    actor: "customer",
    kind: "content_model_click",
    entityType: "content",
    entityId: contentId,
    metadata: { contentId, modelId: model.id },
  });

  return Response.json(
    { recorded: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
