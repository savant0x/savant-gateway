import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readPriceInput } from "@/lib/pricing";
import { getAccountSummary, grantCredit, listCreditLedger } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    {
      account: getAccountSummary(),
      ledger: listCreditLedger(25),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { amountUsd?: unknown; note?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const amountMicros = readPriceInput(body.amountUsd);

  if (amountMicros === null || amountMicros <= 0) {
    return adminError(400, "amountUsd must be a positive dollar amount.");
  }

  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 300) : "";

  try {
    const account = grantCredit({
      amountMicros,
      note: note || "Operator credit grant",
    });

    return Response.json(
      { ok: true, account, ledger: listCreditLedger(25) },
      { headers: NO_STORE },
    );
  } catch (error) {
    return adminError(
      400,
      error instanceof Error ? error.message : "Could not grant credit.",
    );
  }
}
