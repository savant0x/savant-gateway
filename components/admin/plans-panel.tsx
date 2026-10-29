"use client";

import type {
  AdminModelSummary,
  ModelGroupSummary,
  PlanSummary,
} from "@/lib/types";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  EMPTY_PLAN_DRAFT,
  PlanFields,
  planBody,
  planDraftFrom,
  type PlanDraft,
} from "@/components/admin/plan-fields";
import {
  formatCompact,
  formatMicros,
  formatRatePercent,
  responseError,
} from "@/components/dashboard/format";
import { intervalLabel } from "@/lib/plan-lifecycle";

function statusColor(status: PlanSummary["status"]) {
  if (status === "active") return "success" as const;
  if (status === "archived") return "warning" as const;

  return "default" as const;
}

function summary(plan: PlanSummary) {
  const parts = [
    `${formatMicros(plan.priceMicros)} / ${plan.interval}`,
    `${formatCompact(plan.includedWeightedTokens)} included`,
    `${plan.modelCount} models`,
    `${plan.activeSubscriberCount} active subscribers`,
  ];

  return parts.join(" · ");
}

export function PlansPanel({
  plans,
  groups,
  models,
}: {
  plans: PlanSummary[];
  groups: ModelGroupSummary[];
  models: AdminModelSummary[];
}) {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<PlanDraft | null>(null);
  const [editDraft, setEditDraft] = useState<PlanDraft | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const modelOptions = models
    .filter((model) => model.groupBillingMode !== "free")
    .map((model) => ({
      id: model.id,
      name: model.name,
      groupLabel: model.groupLabel,
      inCatalog: model.inCatalog,
    }));

  async function send(input: {
    key: string;
    method: "POST" | "PATCH" | "DELETE";
    body: unknown;
    message: string;
  }) {
    setBusy(input.key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/plans", {
        method: input.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.body),
      });

      if (response.status === 401) {
        router.replace("/admin/login");

        return false;
      }

      if (!response.ok) throw new Error(await responseError(response));

      setNotice(input.message);
      router.refresh();

      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not save the plan.",
      );

      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!createDraft) return;

    const saved = await send({
      key: "create",
      method: "POST",
      body: planBody(createDraft),
      message: `Created ${createDraft.name || "plan"}.`,
    });

    if (saved) setCreateDraft(null);
  }

  async function saveEdit() {
    if (!editDraft || !editId) return;

    const saved = await send({
      key: "edit",
      method: "PATCH",
      body: { id: editId, ...planBody(editDraft) },
      message: `Updated ${editDraft.name}.`,
    });

    if (saved) {
      setEditDraft(null);
      setEditId(null);
    }
  }

  async function archive(plan: PlanSummary) {
    await send({
      key: `archive:${plan.id}`,
      method: "PATCH",
      body: {
        id: plan.id,
        ...planBody(planDraftFrom(plan)),
        status: "archived",
      },
      message: `Archived ${plan.name}. Existing subscribers keep access.`,
    });
  }

  async function confirmDelete() {
    if (!deleteId) return;

    const saved = await send({
      key: "delete",
      method: "DELETE",
      body: { id: deleteId },
      message: "Plan deleted.",
    });

    if (saved) setDeleteId(null);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
          {notice}
        </p>
      ) : null}

      <Card>
        <Card.Header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Card.Title>Plan catalog</Card.Title>
              <Card.Description>
                Plan edits affect future checkouts and grants. Existing
                subscriptions keep the snapshot they bought.
              </Card.Description>
            </div>
            <Button
              size="sm"
              variant="primary"
              onPress={() =>
                createDraft
                  ? setCreateDraft(null)
                  : setCreateDraft({ ...EMPTY_PLAN_DRAFT })
              }
            >
              {createDraft ? "Close editor" : "New plan"}
            </Button>
          </div>
        </Card.Header>
        <Card.Content className="space-y-4">
          {createDraft ? (
            <div className="space-y-3 rounded-2xl border border-black/10 p-4 dark:border-white/10">
              <p className="text-sm font-medium">Create plan</p>
              <PlanFields
                draft={createDraft}
                editing={false}
                groups={groups}
                models={modelOptions}
                onChange={(patch) =>
                  setCreateDraft((current) =>
                    current ? { ...current, ...patch } : current,
                  )
                }
              />
              <Button
                isDisabled={busy === "create"}
                variant="primary"
                onPress={create}
              >
                {busy === "create" ? <Spinner size="sm" /> : null}
                Create plan
              </Button>
            </div>
          ) : null}

          {plans.length === 0 ? (
            <p className="text-xs text-muted">
              No plans yet. Create a draft, add groups or models, then set it
              active to publish it on /plans.
            </p>
          ) : (
            <div className="space-y-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl border border-black/10 p-3 text-xs dark:border-white/10"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{plan.name}</span>
                        <Chip color={statusColor(plan.status)}>
                          {plan.status}
                        </Chip>
                        {plan.costBearingModelCount > 0 ? (
                          <span className="text-[11px] text-warning">
                            {plan.costBearingModelCount} cost-bearing models
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-muted">{summary(plan)}</p>
                      <p className="mt-1 text-muted">
                        {intervalLabel(plan.interval)} · groups:{" "}
                        {plan.groups.map((group) => group.label).join(", ") ||
                          "none"}
                        {plan.overageMode === "credit"
                          ? ` · overage +${formatRatePercent(plan.overageMarkupBps)}`
                          : " · overage blocked"}
                      </p>
                      {plan.modelCount === 0 ? (
                        <p className="mt-1 text-warning">
                          No included models — this plan cannot activate.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => {
                          setEditId(plan.id);
                          setEditDraft(planDraftFrom(plan));
                        }}
                      >
                        Edit
                      </Button>
                      {plan.status === "active" ? (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() => archive(plan)}
                        >
                          Archive
                        </Button>
                      ) : null}
                      {deleteId === plan.id ? (
                        <>
                          <Button
                            isDisabled={busy === "delete"}
                            size="sm"
                            variant="primary"
                            onPress={confirmDelete}
                          >
                            Confirm delete
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onPress={() => setDeleteId(null)}
                          >
                            Keep
                          </Button>
                        </>
                      ) : (
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() => setDeleteId(plan.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>

                  {editDraft && editId === plan.id ? (
                    <div className="mt-4 space-y-3 border-t border-black/10 pt-4 dark:border-white/10">
                      <PlanFields
                        editing
                        draft={editDraft}
                        groups={groups}
                        models={modelOptions}
                        onChange={(patch) =>
                          setEditDraft((current) =>
                            current ? { ...current, ...patch } : current,
                          )
                        }
                      />
                      <div className="flex gap-2">
                        <Button
                          isDisabled={busy === "edit"}
                          variant="primary"
                          onPress={saveEdit}
                        >
                          {busy === "edit" ? <Spinner size="sm" /> : null}
                          Save plan
                        </Button>
                        <Button
                          variant="secondary"
                          onPress={() => {
                            setEditDraft(null);
                            setEditId(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
