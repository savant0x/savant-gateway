import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readMarkupInput, readPriceInput } from "@/lib/pricing";
import {
  applyCatalogMarkup,
  getPricingData,
  listAllModels,
  saveMarkupBps,
  setModelPricing,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(getPricingData(), { headers: NO_STORE });
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: {
    id?: unknown;
    inputPricePer1M?: unknown;
    outputPricePer1M?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const id = typeof body.id === "string" ? body.id : "";
  const inputMicros = readPriceInput(body.inputPricePer1M);
  const outputMicros = readPriceInput(body.outputPricePer1M);

  if (!id || inputMicros === null || outputMicros === null) {
    return adminError(
      400,
      "A model id and non-negative input/output prices (USD per 1M) are required.",
    );
  }

  const model = listAllModels().find((row) => row.id === id);

  if (!model) return adminError(404, "Model not found.");

  if (model.access === "free") {
    return adminError(400, "Free-pool models are always priced at zero.");
  }

  if (!setModelPricing(id, inputMicros, outputMicros)) {
    return adminError(404, "Model not found.");
  }

  return Response.json(
    { ok: true, model: listAllModels().find((row) => row.id === id) },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: { markupBps?: unknown; applyToAll?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const markupBps = readMarkupInput(body.markupBps);

  if (markupBps === null) {
    return adminError(400, "markupBps must be between 0 and 100000.");
  }

  const applyToAll = body.applyToAll === true;

  saveMarkupBps(markupBps);
  const changed = applyCatalogMarkup(markupBps, applyToAll);

  return Response.json(
    { ok: true, markupBps, changed, applyToAll },
    { headers: NO_STORE },
  );
}
