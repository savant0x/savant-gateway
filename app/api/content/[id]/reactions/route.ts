import { customerError, requireCustomerApi } from "@/lib/customer-auth";
import { contentEnabled } from "@/lib/content/policy";
import {
  isContentReaction,
  ReactionRateLimitError,
  setReaction,
} from "@/lib/content/store/engagement";
import { getItem } from "@/lib/content/store/items";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets one reaction on or off (FID-2026-1102-100).
 *
 * The composite primary key makes a retry idempotent. The event log in the
 * store bounds add/remove churn against the same hourly ceiling as comments.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!contentEnabled()) return customerError(404, "Signal is not enabled.");

  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (!isContentReaction(body.reaction)) {
    return customerError(400, "That reaction is not supported.");
  }

  if (typeof body.active !== "boolean") {
    return customerError(400, "active must be true or false.");
  }

  const itemId = (await params).id;
  const db = await getDatabase();
  const item = await getItem(db, itemId);

  if (!item) return customerError(404, "That item does not exist.");

  try {
    const reactions = await setReaction(
      db,
      customer.id,
      item.id,
      body.reaction,
      body.active,
    );

    return Response.json(
      { reactions },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof ReactionRateLimitError) {
      return customerError(429, error.message);
    }

    return customerError(500, "Could not update that reaction.");
  }
}
