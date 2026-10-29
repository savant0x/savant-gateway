import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readPriceInput } from "@/lib/pricing";
import { listAllModels, setModelCost, setModelStatus } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = new Set(["active", "disabled"]);

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json({ models: listAllModels() }, { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: {
    id?: unknown;
    status?: unknown;
    costInputPer1M?: unknown;
    costOutputPer1M?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id : "";
  const status = typeof body.status === "string" ? body.status : "";
  const hasCost =
    body.costInputPer1M !== undefined || body.costOutputPer1M !== undefined;

  if (!id) return adminError(400, "A model id is required.");

  if (status && !STATUSES.has(status)) {
    return adminError(400, "status must be active or disabled.");
  }

  if (status) {
    const result = setModelStatus(id, status as "active" | "disabled");

    if (result === "not_found") return adminError(404, "Model not found.");
    if (result === "cost_unknown") {
      return adminError(
        400,
        "Set the upstream cost before enabling this model.",
      );
    }
  }

  if (hasCost) {
    const input = readPriceInput(body.costInputPer1M);
    const output = readPriceInput(body.costOutputPer1M);

    if (input === null || output === null) {
      return adminError(
        400,
        "Both input and output cost (USD per 1M, non-negative) are required.",
      );
    }

    if (!setModelCost(id, input, output)) {
      return adminError(
        400,
        "Cost cannot be edited for this model. Check that it exists and is not free-pool.",
      );
    }
  }

  if (!status && !hasCost) {
    return adminError(400, "Provide a status or a cost to update.");
  }

  const model = listAllModels().find((row) => row.id === id);

  return Response.json({ ok: true, model }, { headers: NO_STORE });
}
