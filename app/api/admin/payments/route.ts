import { guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { listPaymentEvents } from "@/lib/storage/ledger/payment-events";
import { storeRuntime } from "@/lib/store-facade/runtime";
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

  const db = await storeRuntime();

  return Response.json(
    {
      events: await listPaymentEvents(db, 50),
      topups: await listTopups(25),
    },
    { headers: NO_STORE },
  );
}
