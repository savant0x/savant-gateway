import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { readPromoPolicy } from "@/lib/promo-codes";
import {
  getAdminOverview,
  getAnalyticsData,
  listActivity,
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

  return (
    <AdminPanel
      activity={listActivity(12)}
      analytics={getAnalyticsData(30)}
      data={getAdminOverview()}
      promos={{
        enabled: promoPolicy.enabled,
        reason: promoPolicy.reason,
        codes: listPromoCodes(),
      }}
    />
  );
}
