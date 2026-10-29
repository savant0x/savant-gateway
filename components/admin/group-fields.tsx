"use client";

import type { ModelAccess } from "@/lib/types";

import { Input } from "@heroui/react";

export type GroupDraft = {
  slug: string;
  label: string;
  billingMode: ModelAccess;
  description: string;
  sortOrder: string;
};

export const EMPTY_GROUP_DRAFT: GroupDraft = {
  slug: "",
  label: "",
  billingMode: "paid",
  description: "",
  sortOrder: "10",
};

const MODES: Array<{ value: ModelAccess; label: string }> = [
  { value: "free", label: "Free — zero charge" },
  { value: "paid", label: "Paid — credit hold" },
  { value: "subscription", label: "Subscription — plan tier" },
];

export function GroupFields({
  draft,
  billingLocked,
  onChange,
}: {
  draft: GroupDraft;
  billingLocked?: boolean;
  onChange: (patch: Partial<GroupDraft>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <span className="text-xs text-muted">Label</span>
        <Input
          aria-label="Group label"
          value={draft.label}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </div>
      <label className="space-y-1 text-xs text-muted">
        <span className="block">Billing mode</span>
        <select
          className="h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60 dark:border-white/10"
          disabled={billingLocked}
          value={draft.billingMode}
          onChange={(event) =>
            onChange({ billingMode: event.target.value as ModelAccess })
          }
        >
          {MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
      </label>
      <div className="space-y-1">
        <span className="text-xs text-muted">Description</span>
        <Input
          aria-label="Group description"
          value={draft.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <span className="text-xs text-muted">Sort order</span>
        <Input
          aria-label="Group sort order"
          type="number"
          value={draft.sortOrder}
          onChange={(event) => onChange({ sortOrder: event.target.value })}
        />
      </div>
    </div>
  );
}
