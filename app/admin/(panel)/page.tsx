import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { getAdminOverview, getAnalyticsData } from "@/lib/store";
import { refreshProviderRuntime } from "@/lib/providers/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await refreshProviderRuntime("savant");

  return (
    <AdminPanel analytics={getAnalyticsData(30)} data={getAdminOverview()} />
  );
}
