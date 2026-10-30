import { guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { listPaymentEvents } from "@/lib/payment-events";
import { listTopups } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Operator visibility for payment delivery: event state including failed,
 * stale and quarantined claims, plus pending and paid top-ups. Replay still
 * requires a signed Stripe delivery; this route never marks a payment paid.
 */
export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    {
      events: listPaymentEvents(db, 50),
      topups: listTopups(25),
    },
    { headers: NO_STORE },
  );
}
