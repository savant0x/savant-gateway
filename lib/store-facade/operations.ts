import * as admin from "../storage/store/admin.ts";
import * as policies from "../storage/store/policies.ts";
import * as quota from "../storage/store/quota.ts";
import * as support from "../storage/store/support.ts";

import { bound } from "./bound.ts";

/**
 * Support, policy, quota and session façade (FID-086, step 4).
 */

export const effectiveProviderRemaining = bound(
  quota.effectiveProviderRemaining,
);

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
