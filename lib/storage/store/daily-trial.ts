import type { PostgresDatabase } from "../pg-adapter.ts";

import {
  accountDailyAllowance,
  remainingAllocation,
} from "../../allocation.ts";
import { readFreePoolConfig } from "../../free-pool.ts";
import { quotaIsCurrent } from "../../provider-quota.ts";
import { readTrialConfig } from "../../trials.ts";

import {
  ensureDailyAllocation,
  getObservedAllocationConfig,
} from "./allocations.ts";
import { getProviderStatusBySlug } from "./providers.ts";

/**
 * Daily token credits, ported to the async handle (FID-086, Batch B).
 *
 * This summary is display state: it says what the account has for today, and it
 * never touches the prepaid wallet. The numbers it shows must therefore agree
 * with the admission path, which is why it reads the same allocation config and
 * the same pool rows rather than computing a friendlier version.
 *
 * `refresh` is a parameter instead of an import. The live refresher
 * (`lib/providers/runtime.ts`) imports `server-only`, so importing it here would
 * make this module unloadable by the test runner; the caller that can reach the
 * network passes it in, and without it the summary honestly reports the stored
 * observation.
 */

/** Daily token credits are never written to the prepaid dollar wallet. */
export async function getDailyTrialSummary(
  db: PostgresDatabase,
  userId: string,
  refresh?: (slug: string) => Promise<unknown>,
) {
  if (readTrialConfig().enabled) return null;

  if (refresh) await refresh("savant");

  return db
    .transaction(async () => {
      const status = await getProviderStatusBySlug(db, "savant");
      const config = await getObservedAllocationConfig(db);
      const at = new Date().toISOString();
      const day = at.slice(0, 10);
      const activeKey = await db
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
          ? await ensureDailyAllocation(db, userId, day)
          : 0;
      const allocated =
        activeKey && available
          ? accountDailyAllowance(
              config,
              config.enabled ? share : readFreePoolConfig().dailyWeightedTokens,
            )
          : 0;
      const used = await db
        .prepare(
          "SELECT weighted_tokens AS used FROM free_pool_usage WHERE user_id = ? AND day = ?",
        )
        .get<{ used: number | string }>(userId, day);
      const held = await db
        .prepare(
          `SELECT COALESCE(SUM(weighted_tokens), 0) AS held
             FROM free_pool_reservations
            WHERE user_id = ? AND expires_at > ?`,
        )
        .get<{ held: number | string }>(userId, at);
      const usedTokens = Math.max(0, Number(used?.used ?? 0));
      const heldTokens = Math.max(0, Number(held?.held ?? 0));

      return {
        available,
        activated: Boolean(activeKey),
        allocatedTokens: allocated,
        usedTokens,
        heldTokens,
        remainingTokens: available
          ? Math.min(
              remainingAllocation({
                allocatedTokens: allocated,
                usedTokens,
                heldTokens,
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
