import * as admin from "../storage/store/admin.ts";
import * as allocations from "../storage/store/allocations.ts";
import * as dailyTrial from "../storage/store/daily-trial.ts";
import * as freePool from "../storage/store/free-pool.ts";
import * as policies from "../storage/store/policies.ts";
import * as quota from "../storage/store/quota.ts";
import * as support from "../storage/store/support.ts";

import { bound } from "./bound.ts";

/**
 * Allocation, support and session façade (FID-086, step 4).
 *
 * Two exports stay unwrapped because they are clock helpers, not queries:
 * `utcDay` decides which day a free-pool reservation belongs to and reads no
 * storage, so making it await a connection would let a midnight boundary depend
 * on connection latency.
 */

export const getDailyTrialSummary = bound(dailyTrial.getDailyTrialSummary);
export const reserveFreeCall = bound(freePool.reserveFreeCall);
export const settleFreeReservation = bound(freePool.settleFreeReservation);
export { utcDay } from "../storage/store/free-pool.ts";

export const effectiveProviderRemaining = bound(
  quota.effectiveProviderRemaining,
);

export const getAllocationConfig = bound(allocations.getAllocationConfig);
export const saveAllocationConfig = bound(allocations.saveAllocationConfig);
export const getObservedAllocationConfig = bound(
  allocations.getObservedAllocationConfig,
);
export const ensureDailyAllocation = bound(allocations.ensureDailyAllocation);
export const getAllocationSummary = bound(allocations.getAllocationSummary);

export const createSupportRequest = bound(support.createSupportRequest);
export const getSupportRequest = bound(support.getSupportRequest);
export const listSupportRequestsForUser = bound(
  support.listSupportRequestsForUser,
);
export const listSupportRequests = bound(support.listSupportRequests);
export const resolveSupportRequest = bound(support.resolveSupportRequest);
export const countOpenSupportRequests = bound(support.countOpenSupportRequests);

export const getPolicyAcceptance = bound(policies.getPolicyAcceptance);
export const hasAcceptedPolicy = bound(policies.hasAcceptedPolicy);
export const recordPolicyAcceptance = bound(policies.recordPolicyAcceptance);

export const getAdminSessionEpoch = bound(admin.getAdminSessionEpoch);
export const bumpAdminSessionEpoch = bound(admin.bumpAdminSessionEpoch);
