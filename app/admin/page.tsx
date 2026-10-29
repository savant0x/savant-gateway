import type { Metadata } from "next";

import { AdminPanel } from "@/components/admin/admin-panel";
import { requireAdminPage } from "@/lib/admin-auth";
import { getAdminOverview } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await requireAdminPage();

  return <AdminPanel data={getAdminOverview()} />;
}
