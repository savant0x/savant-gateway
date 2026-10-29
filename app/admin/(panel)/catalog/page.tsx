import type { Metadata } from "next";

import { AdminModelsTable } from "@/components/admin/models-table";
import { listAllModels, listModelGroups } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin catalog",
  robots: { index: false, follow: false },
};

export default function AdminCatalogPage() {
  const models = listAllModels();
  const groups = listModelGroups();
  const disabled = models.filter((model) => model.status === "disabled").length;
  const delisted = models.filter((model) => !model.inCatalog).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Catalog
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Every model, every state
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The provider catalog with operator disables, delisted rows, sell
            prices, and upstream cost. Sync is additive: it never deletes a row
            or overwrites a manual price.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {models.length} rows · {disabled} disabled · {delisted} delisted
        </div>
      </div>

      <AdminModelsTable groups={groups} models={models} />
    </>
  );
}
