import type { PostgresDatabase } from "../pg-adapter.ts";
import type { GatewayModel } from "../../projections.ts";

import { modelAdmissionRefusal } from "../../providers/eligibility.ts";
import { getModelByUpstreamId, getModelForGateway } from "../store/models.ts";

export {
  failureStatus,
  isFreeCall,
  retryHeaders,
  safeUpstreamMessage,
} from "../../gateway-refusal.ts";

/**
 * Model resolution on the async handle (FID-086, gateway port).
 *
 * The alias rules are the synchronous module's, unchanged: an exact public id
 * wins, then the two legacy free aliases, then a `family-rest` split into
 * `family/rest`, and only then an upstream id. Keeping the order matters —
 * resolving an upstream id first would let a delisted public id answer from a
 * row the customer never asked for.
 */
export async function resolveModel(db: PostgresDatabase, publicId: string) {
  const exact = await getModelForGateway(db, publicId);

  if (exact) return exact;

  const candidates: string[] = [];

  if (publicId.startsWith("free-"))
    candidates.push(`free/${publicId.slice(5)}`);
  if (publicId.endsWith("-free"))
    candidates.push(`free/${publicId.slice(0, -5)}`);

  if (!publicId.includes("/")) {
    const dash = publicId.indexOf("-");

    if (dash > 0)
      candidates.push(`${publicId.slice(0, dash)}/${publicId.slice(dash + 1)}`);
  }

  for (const candidate of candidates) {
    const model = await getModelForGateway(db, candidate);

    if (model) return model;
  }

  return getModelByUpstreamId(db, publicId);
}

/** The gateway's refusal for a resolved model, before admission or dispatch. */
export function modelRefusal(model: GatewayModel) {
  return modelAdmissionRefusal({
    requiresReview: model.requiresModelReview,
    decision: model.decision,
    billingMode: model.billingMode,
    costSource: model.costSource,
    costInputMicros: model.costInputMicros,
    costOutputMicros: model.costOutputMicros,
    sellInputMicros: model.sellInputMicros,
    sellOutputMicros: model.sellOutputMicros,
    costObservedAt: model.costObservedAt,
  });
}
