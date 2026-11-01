import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { readPromoPolicy } from "@/lib/promo-codes";
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
  const [activity, analytics, data, codes, providers] = await Promise.all([
    listActivity(12),
    getAnalyticsData(30),
    getAdminOverview(),
    listPromoCodes(),
    listProviderCatalogSummary(),
  ]);

  return (
    <AdminPanel
      activity={activity}
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
