import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { readPromoPolicy } from "@/lib/promo-codes";
import { getDatabase } from "@/lib/storage/runtime";
import { activityCounts } from "@/lib/storage/store/activity";
import {
  getAdminOverview,
  getAnalyticsData,
  listActivity,
  listProviderCatalogSummary,
  listPromoCodes,
} from "@/lib/store";
import { refreshProviderRuntime } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await refreshProviderRuntime("savant");

  const promoPolicy = readPromoPolicy();
  const db = await getDatabase();
  const until = new Date().toISOString();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [activity, activitySummary, analytics, data, codes, providers] =
    await Promise.all([
      listActivity(12),
      activityCounts(db, { since, until }),
      getAnalyticsData(30),
      getAdminOverview(),
      listPromoCodes(),
      listProviderCatalogSummary(),
    ]);

  return (
    <AdminPanel
      activity={activity}
      activityCounts={activitySummary}
      analytics={analytics}
      data={data}
      promos={{
        enabled: promoPolicy.enabled,
        reason: promoPolicy.reason,
        codes,
      }}
      providers={providers}
    />
  );
}
