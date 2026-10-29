import type { Metadata } from "next";

import { GroupsPanel } from "@/components/admin/groups-panel";
import { listModelGroups } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin groups",
  robots: { index: false, follow: false },
};

export default function AdminGroupsPage() {
  const groups = listModelGroups();
  const custom = groups.filter((group) => !group.isSystem).length;
  const assigned = groups.reduce((total, group) => total + group.modelCount, 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Groups
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Billing groups and membership
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            A group owns its billing mode and label. Move a model to a paid
            group to charge for a zero-cost model, then set its sell price on
            the Pricing page.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {groups.length} groups · {custom} custom · {assigned} assignments
        </div>
      </div>

      <GroupsPanel groups={groups} />
    </>
  );
}
