import type { Metadata } from "next";

import { OperationsPanel } from "@/components/admin/operations-panel";
import { readAlertTransportConfig } from "@/lib/alert-transport";
import { listProviders } from "@/lib/store-facade/catalog";
import {
  getAdmissionControl,
  getOperationsSnapshot,
  listOperationIncidents,
} from "@/lib/store-facade/insights";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin operations",
  robots: { index: false, follow: false },
};

export default async function AdminOperationsPage() {
  const transport = readAlertTransportConfig(process.env);
  const providers = await listProviders();
  const initial = {
    snapshot: await getOperationsSnapshot(),
    admission: await getAdmissionControl(),
    incidents: await listOperationIncidents(200),
    providers: providers.map((provider) => ({
      slug: provider.slug,
      label: provider.label,
      enabled: provider.enabled,
      status: provider.status,
    })),
    transport: {
      configured: transport.configured,
      problem: transport.configured ? null : transport.problem,
    },
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Operations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Observation and incident response
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            This page reads durable state only. It does not call a provider or
            infer health from missing data: no traffic is shown as no traffic,
            and stale quota is shown as stale. Pause and drain refuse new
            inference; they do not stop payment fulfillment or settlement.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          Updated{" "}
          <time dateTime={initial.snapshot.generatedAt}>
            {initial.snapshot.generatedAt}
          </time>
        </div>
      </div>

      <OperationsPanel initial={initial} />
    </>
  );
}
