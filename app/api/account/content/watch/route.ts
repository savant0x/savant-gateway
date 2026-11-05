import { customerError, requireCustomerApi } from "@/lib/customer-auth";
import { isWatching, setWatch } from "@/lib/content/store/engagement";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
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

  const modelId = typeof body.modelId === "string" ? body.modelId.trim() : "";
  const watched = body.watched;

  if (!modelId || typeof watched !== "boolean") {
    return customerError(400, "modelId and watched are required.");
  }

  const db = await getDatabase();
  const model = await db
    .prepare(
      "SELECT 1 AS present FROM models WHERE id = ? AND in_catalog = 1 AND status = 'active'",
    )
    .get<{ present: number }>(modelId);

  if (!model) return customerError(404, "That model is not in the catalog.");

  try {
    const existing = await isWatching(db, customer.id, modelId);
    const next = await setWatch(db, customer.id, modelId, watched);

    if (next && !existing) {
      await recordActivityBestEffort({
        userId: customer.id,
        actor: "customer",
        kind: "follow_created",
        entityType: "model",
        entityId: modelId,
        metadata: { modelId },
      });
    }

    return Response.json(
      { watched: next },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return customerError(
      409,
      error instanceof Error ? error.message : "Could not update follow.",
    );
  }
}
