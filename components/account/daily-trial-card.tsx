import { DailyTrialBalance } from "./daily-trial-balance";

import { getDailyTrialSummary } from "@/lib/store/daily-trial";

export async function DailyTrialCard({ userId }: { userId: string }) {
  const trial = await getDailyTrialSummary(userId);

  return trial ? <DailyTrialBalance initial={trial} /> : null;
}
