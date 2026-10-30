import "server-only";

import { accountDailyAllowance, remainingAllocation } from "../allocation";
import { db } from "../db";
import { readFreePoolConfig } from "../free-pool";
import { quotaIsCurrent } from "../provider-quota";
import { refreshProviderRuntime } from "../providers/runtime";
import { readTrialConfig } from "../trials";

import {
  ensureDailyAllocation,
  getObservedAllocationConfig,
} from "./allocations";
import { getProviderStatusBySlug } from "./providers";

/** Daily token credits are never written to the prepaid dollar wallet. */
export async function getDailyTrialSummary(userId: string) {
  if (readTrialConfig().enabled) return null;

  await refreshProviderRuntime("savant");

  return db
    .transaction(() => {
      const status = getProviderStatusBySlug("savant");
      const config = getObservedAllocationConfig();
      const at = new Date().toISOString();
      const day = at.slice(0, 10);
      const activeKey = db
        .prepare(
          "SELECT 1 FROM api_keys WHERE user_id = ? AND status = 'active' LIMIT 1",
        )
        .get(userId);
      const available =
        quotaIsCurrent(status) &&
        status.subscriptionAllowed === true &&
        config.dailyPoolTokens > 0;
      const share =
        available && activeKey && config.enabled
          ? ensureDailyAllocation(userId, day)
          : 0;
      const allocated =
        activeKey && available
          ? accountDailyAllowance(
              config,
              config.enabled ? share : readFreePoolConfig().dailyWeightedTokens,
            )
          : 0;
      const used = db
        .prepare(
          "SELECT weighted_tokens AS used FROM free_pool_usage WHERE user_id = ? AND day = ?",
        )
        .get(userId, day) as { used: number } | undefined;
      const held = db
        .prepare(
          `SELECT COALESCE(SUM(weighted_tokens), 0) AS held
      FROM free_pool_reservations WHERE user_id = ? AND expires_at > ?`,
        )
        .get(userId, at) as { held: number };

      return {
        available,
        activated: !!activeKey,
        allocatedTokens: allocated,
        usedTokens: used?.used ?? 0,
        heldTokens: held.held,
        remainingTokens: available
          ? Math.min(
              remainingAllocation({
                allocatedTokens: allocated,
                usedTokens: used?.used ?? 0,
                heldTokens: held.held,
              }),
              status.quota.unlimited
                ? Number.MAX_SAFE_INTEGER
                : Math.max(
                    0,
                    (status.admissionRemainingTokens ?? 0) -
                      readFreePoolConfig().providerRemainingFloor,
                  ),
            )
          : null,
        resetsAt: available ? status.quota.resetsAt : null,
        checkedAt: available ? status.quota.checkedAt : null,
        observedAt: available ? status.quota.observedAt : null,
      };
    })
    .immediate();
}

export type DailyTrialSummary = NonNullable<
  Awaited<ReturnType<typeof getDailyTrialSummary>>
>;
