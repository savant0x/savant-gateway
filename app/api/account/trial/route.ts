import { NO_STORE, requireCustomerApi } from "@/lib/customer-auth";
import { sanitizeError } from "@/lib/http";
import { getDailyTrialSummary } from "@/lib/store/daily-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const customer = await requireCustomerApi(request);

  if (customer instanceof Response) return customer;

  try {
    const trial = await getDailyTrialSummary(customer.id);

    return Response.json(
      { trial },
      { status: trial?.available ? 200 : 503, headers: NO_STORE },
    );
  } catch (error) {
    return Response.json(
      {
        error: sanitizeError(
          "account.trial",
          error,
          "Trial credits unavailable.",
        ),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}
