import { NO_STORE, requireCustomerApi } from "@/lib/customer-auth";
import { sanitizeError } from "@/lib/http";
import { getDatabase } from "@/lib/storage/runtime";
import { trialBalance } from "@/lib/storage/ledger/trials";
import { getDailyTrialSummary } from "@/lib/store-facade/operations";
import { readTrialConfig } from "@/lib/trials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The free-allocation panel's `Check now` read (FID-150).
 *
 * It returns the snapshot the page actually renders, selected by the same
 * trial flag. `/api/account/trial` is daily-only by contract: it returns `503`
 * with `trial: null` in lifetime mode, so reusing it here would make a working
 * trial look unavailable.
 */
export async function GET(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  try {
    if (readTrialConfig().enabled) {
      const lifetime = await trialBalance(
        await getDatabase(),
        customer.id,
        new Date().toISOString(),
      );

      return Response.json(
        { mode: "lifetime", daily: null, lifetime },
        { headers: NO_STORE },
      );
    }

    const daily = await getDailyTrialSummary(customer.id);

    if (!daily) {
      return Response.json(
        { error: "Daily allocation is not configured for this account." },
        { status: 503, headers: NO_STORE },
      );
    }

    return Response.json(
      { mode: "daily", daily, lifetime: null },
      { headers: NO_STORE },
    );
  } catch (error) {
    return Response.json(
      {
        error: sanitizeError(
          "account.allocation",
          error,
          "Allocation unavailable.",
        ),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
