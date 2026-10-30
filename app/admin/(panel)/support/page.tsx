import type { Metadata } from "next";

import { SupportQueue } from "@/components/admin/support-queue";
import { countOpenSupportRequests, listSupportRequests } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin — Support",
  robots: { index: false, follow: false },
};

export default function AdminSupportPage() {
  const open = countOpenSupportRequests();
  const requests = listSupportRequests(200);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Support and data requests</h1>
        <p className="text-sm text-white/60">
          {open} open · {requests.length} shown. Requests are written only by an
          authenticated customer; resolving one records the note on the request
          and shows it to that customer.
        </p>
      </div>

      <SupportQueue initial={requests} />
    </div>
  );
}
