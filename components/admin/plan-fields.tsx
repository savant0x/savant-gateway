"use client";

import type { ModelGroupSummary, PlanStatus, PlanSummary } from "@/lib/types";

import { Input } from "@heroui/react";

export type PlanDraft = {
  slug: string;
  name: string;
  description: string;
  status: PlanStatus;
  priceUsd: string;
  interval: "month" | "year";
  includedWeightedTokens: string;
  overageMode: "block" | "credit";
  overageMarkupBps: string;
  sortOrder: string;
  groups: string[];
  modelIds: string[];
};

export const EMPTY_PLAN_DRAFT: PlanDraft = {
  slug: "",
  name: "",
  description: "",
  status: "draft",
  priceUsd: "9",
  interval: "month",
  includedWeightedTokens: "1000000",
  overageMode: "block",
  overageMarkupBps: "0",
  sortOrder: "10",
  groups: [],
  modelIds: [],
};

export function planDraftFrom(plan: PlanSummary): PlanDraft {
  return {
    slug: plan.slug,
    name: plan.name,
    description: plan.description ?? "",
    status: plan.status,
    priceUsd: (plan.priceMicros / 1_000_000).toFixed(2),
    interval: plan.interval,
    includedWeightedTokens: String(plan.includedWeightedTokens),
    overageMode: plan.overageMode,
    overageMarkupBps: String(plan.overageMarkupBps),
    sortOrder: String(plan.sortOrder),
    groups: plan.groups.map((group) => group.slug),
    modelIds: plan.modelIds,
  };
}

export function planBody(draft: PlanDraft) {
  return {
    slug: draft.slug,
    name: draft.name,
    description: draft.description,
    status: draft.status,
    priceUsd: Number(draft.priceUsd),
    interval: draft.interval,
    includedWeightedTokens: Number(draft.includedWeightedTokens),
    overageMode: draft.overageMode,
    overageMarkupBps: Number(draft.overageMarkupBps),
    sortOrder: Number(draft.sortOrder),
    groups: draft.groups,
    modelIds: draft.modelIds,
  };
}

const selectClass =
  "h-10 w-full rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none focus:border-accent disabled:opacity-60 dark:border-white/10";

export function PlanFields({
  draft,
  groups,
  models,
  editing,
  onChange,
}: {
  draft: PlanDraft;
  groups: ModelGroupSummary[];
  models: Array<{
    id: string;
    name: string;
    groupLabel: string;
    inCatalog: boolean;
  }>;
  editing: boolean;
  onChange: (patch: Partial<PlanDraft>) => void;
}) {
  const selectable = groups.filter((group) => group.billingMode !== "free");
  const freeGroups = groups
    .filter((group) => group.billingMode === "free")
    .map((group) => group.slug);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-xs text-muted">Slug</span>
          <Input
            aria-label="Plan slug"
            disabled={editing}
            placeholder="starter"
            value={draft.slug}
            onChange={(event) => onChange({ slug: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted">Name</span>
          <Input
            aria-label="Plan name"
            placeholder="Starter"
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <span className="text-xs text-muted">Description</span>
          <Input
            aria-label="Plan description"
            placeholder="Included models and monthly allowance"
            value={draft.description}
            onChange={(event) => onChange({ description: event.target.value })}
          />
        </div>

        <label className="space-y-1 text-xs text-muted">
          <span className="block">Status</span>
          <select
            className={selectClass}
            value={draft.status}
            onChange={(event) =>
              onChange({ status: event.target.value as PlanStatus })
            }
          >
            <option value="draft">Draft — not public</option>
            <option value="active">Active — listed and purchasable</option>
            <option value="archived">Archived — no new checkouts</option>
          </select>
        </label>

        <div className="space-y-1">
          <span className="text-xs text-muted">Price (USD)</span>
          <Input
            aria-label="Plan price in US dollars"
            inputMode="decimal"
            value={draft.priceUsd}
            onChange={(event) => onChange({ priceUsd: event.target.value })}
          />
        </div>

        <label className="space-y-1 text-xs text-muted">
          <span className="block">Interval</span>
          <select
            className={selectClass}
            value={draft.interval}
            onChange={(event) =>
              onChange({ interval: event.target.value as "month" | "year" })
            }
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
        </label>

        <div className="space-y-1">
          <span className="text-xs text-muted">
            Included weighted tokens / period
          </span>
          <Input
            aria-label="Included weighted tokens"
            inputMode="numeric"
            value={draft.includedWeightedTokens}
            onChange={(event) =>
              onChange({ includedWeightedTokens: event.target.value })
            }
          />
        </div>

        <label className="space-y-1 text-xs text-muted">
          <span className="block">Overage policy</span>
          <select
            className={selectClass}
            value={draft.overageMode}
            onChange={(event) =>
              onChange({
                overageMode: event.target.value as "block" | "credit",
              })
            }
          >
            <option value="block">Block at the allowance</option>
            <option value="credit">Charge prepaid credit</option>
          </select>
        </label>

        <div className="space-y-1">
          <span className="text-xs text-muted">Overage markup (bps)</span>
          <Input
            aria-label="Overage markup basis points"
            inputMode="numeric"
            value={draft.overageMarkupBps}
            onChange={(event) =>
              onChange({ overageMarkupBps: event.target.value })
            }
          />
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted">Sort order</span>
          <Input
            aria-label="Plan sort order"
            inputMode="numeric"
            value={draft.sortOrder}
            onChange={(event) => onChange({ sortOrder: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted">
          Included groups — every catalog model in these groups is covered.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {selectable.map((group) => (
            <label
              key={group.slug}
              className="flex items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-xs dark:border-white/10"
            >
              <input
                checked={draft.groups.includes(group.slug)}
                type="checkbox"
                onChange={(event) =>
                  onChange({
                    groups: event.target.checked
                      ? [...draft.groups, group.slug]
                      : draft.groups.filter((slug) => slug !== group.slug),
                  })
                }
              />
              <span>{group.label}</span>
              <span className="ml-auto text-muted">{group.modelCount}</span>
            </label>
          ))}
        </div>
        {freeGroups.length > 0 ? (
          <p className="text-[11px] text-muted">
            Free groups ({freeGroups.join(", ")}) are already free and cannot be
            included.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted">
          Optional individual models — checked models outside the groups above.
        </p>
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-black/10 p-2 dark:border-white/10">
          {models.map((model) => (
            <label
              key={model.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/5"
            >
              <input
                checked={draft.modelIds.includes(model.id)}
                type="checkbox"
                onChange={(event) =>
                  onChange({
                    modelIds: event.target.checked
                      ? [...draft.modelIds, model.id]
                      : draft.modelIds.filter((id) => id !== model.id),
                  })
                }
              />
              <span className="truncate">{model.name}</span>
              <span className="ml-auto shrink-0 text-muted">
                {model.groupLabel}
                {model.inCatalog ? "" : " · delisted"}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
