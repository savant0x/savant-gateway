import { customerError, requireCustomerApi } from "@/lib/customer-auth";
import { getItem } from "@/lib/content/store/items";
import { setSaved } from "@/lib/content/store/engagement";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

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

  const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
  const saved = body.saved;

  if (!itemId || typeof saved !== "boolean") {
    return customerError(400, "itemId and saved are required.");
  }

  const db = await getDatabase();
  const item = await getItem(db, itemId);

  if (!item) return customerError(404, "That item does not exist.");

  try {
    const next = await setSaved(db, customer.id, itemId, saved);

    return Response.json(
      { saved: next },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return customerError(
      409,
      error instanceof Error ? error.message : "Could not update saved items.",
    );
  }
}
