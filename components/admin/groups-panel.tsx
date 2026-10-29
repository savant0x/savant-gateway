"use client";

import type { ModelAccess, ModelGroupSummary } from "@/lib/types";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  EMPTY_GROUP_DRAFT,
  GroupFields,
  type GroupDraft,
} from "@/components/admin/group-fields";
import { responseError } from "@/components/dashboard/format";

function modeColor(mode: ModelAccess) {
  if (mode === "free") return "success" as const;
  if (mode === "subscription") return "warning" as const;

  return "default" as const;
}

function draftFrom(group: ModelGroupSummary): GroupDraft {
  return {
    slug: group.slug,
    label: group.label,
    billingMode: group.billingMode,
    description: group.description ?? "",
    sortOrder: String(group.sortOrder),
    hidden: group.hidden,
  };
}

export function GroupsPanel({ groups }: { groups: ModelGroupSummary[] }) {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<GroupDraft>(EMPTY_GROUP_DRAFT);
  const [editDraft, setEditDraft] = useState<GroupDraft | null>(null);
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(input: {
    key: string;
    url: string;
    method: "POST" | "PATCH" | "DELETE";
    body: unknown;
    message: string;
  }) {
    setBusy(input.key);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(input.url, {
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
        reason instanceof Error ? reason.message : "Could not save the group.",
      );

      return false;
    } finally {
      setBusy(null);
    }
  }

  function readSortOrder(value: string) {
    const parsed = Number(value);

    return Number.isInteger(parsed) ? parsed : null;
  }

  async function create() {
    const sortOrder = readSortOrder(createDraft.sortOrder);

    if (sortOrder === null) {
      setError("Sort order must be an integer.");

      return;
    }

    const saved = await send({
      key: "create",
      url: "/api/admin/groups",
      method: "POST",
      body: {
        slug: createDraft.slug,
        label: createDraft.label,
        billingMode: createDraft.billingMode,
        description: createDraft.description,
        sortOrder,
        hidden: createDraft.hidden,
      },
      message: `Created ${createDraft.label || "group"}.`,
    });

    if (saved) setCreateDraft(EMPTY_GROUP_DRAFT);
  }

  async function saveEdit() {
    if (!editDraft) return;

    const sortOrder = readSortOrder(editDraft.sortOrder);

    if (sortOrder === null) {
      setError("Sort order must be an integer.");

      return;
    }

    const saved = await send({
      key: `edit:${editDraft.slug}`,
      url: "/api/admin/groups",
      method: "PATCH",
      body: {
        slug: editDraft.slug,
        label: editDraft.label,
        billingMode: editDraft.billingMode,
        description: editDraft.description,
        sortOrder,
        hidden: editDraft.hidden,
      },
      message: `Updated ${editDraft.label}.`,
    });

    if (saved) setEditDraft(null);
  }

  async function confirmDelete() {
    if (!deleteSlug) return;

    const saved = await send({
      key: `delete:${deleteSlug}`,
      url: "/api/admin/groups",
      method: "DELETE",
      body: { slug: deleteSlug, reassignTo },
      message: "Group deleted and its models reassigned.",
    });

    if (saved) setDeleteSlug(null);
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
          <Card.Title>Create a group</Card.Title>
          <Card.Description>
            The slug is permanent. Billing mode decides routing and charging;
            the label is what customers see.
          </Card.Description>
        </Card.Header>
        <Card.Content className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-xs text-muted">Slug</span>
              <Input
                aria-label="New group slug"
                placeholder="starter"
                value={createDraft.slug}
                onChange={(event) =>
                  setCreateDraft((current) => ({
                    ...current,
                    slug: event.target.value,
                  }))
                }
              />
            </div>
            <p className="self-end text-xs text-muted">
              Lowercase letters, digits, and dashes. 2–32 characters.
            </p>
          </div>
          <GroupFields
            draft={createDraft}
            onChange={(patch) =>
              setCreateDraft((current) => ({ ...current, ...patch }))
            }
          />
          <Button
            isDisabled={busy === "create"}
            variant="primary"
            onPress={create}
          >
            {busy === "create" ? <Spinner size="sm" /> : null}
            Create group
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Card.Title>Groups</Card.Title>
              <Card.Description>
                System groups keep their slugs and billing behavior. Custom
                groups can be renamed, repriced, or deleted with reassignment.
              </Card.Description>
            </div>
            <Chip color="default" size="sm" variant="soft">
              {groups.length} groups
            </Chip>
          </div>
        </Card.Header>
        <Card.Content className="divide-y divide-black/10 dark:divide-white/10">
          {groups.map((group) => {
            const editing = editDraft?.slug === group.slug;
            const deleting = deleteSlug === group.slug;
            const destinations = groups.filter(
              (candidate) => candidate.slug !== group.slug,
            );

            return (
              <div
                key={group.slug}
                className="space-y-3 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{group.label}</span>
                      <Chip
                        color={modeColor(group.billingMode)}
                        size="sm"
                        variant="soft"
                      >
                        {group.billingMode}
                      </Chip>
                      {group.isSystem ? (
                        <Chip color="default" size="sm" variant="soft">
                          system
                        </Chip>
                      ) : null}
                      {group.hidden ? (
                        <Chip color="danger" size="sm" variant="soft">
                          hidden
                        </Chip>
                      ) : null}
                    </div>
                    <p className="mono mt-0.5 text-[11px] text-muted">
                      {group.slug} · {group.modelCount} models
                    </p>
                    {group.description ? (
                      <p className="mt-1 text-xs text-muted">
                        {group.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => {
                        setEditDraft(editing ? null : draftFrom(group));
                        setDeleteSlug(null);
                      }}
                    >
                      {editing ? "Cancel" : "Edit"}
                    </Button>
                    {group.isSystem ? null : (
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() => {
                          setDeleteSlug(deleting ? null : group.slug);
                          setReassignTo(
                            destinations.find((item) => item.slug === "paid")
                              ?.slug ??
                              destinations[0]?.slug ??
                              "",
                          );
                          setEditDraft(null);
                        }}
                      >
                        {deleting ? "Cancel" : "Delete"}
                      </Button>
                    )}
                  </div>
                </div>

                {editing && editDraft ? (
                  <div className="space-y-3 rounded-xl bg-surface p-3">
                    <GroupFields
                      billingLocked={group.isSystem}
                      draft={editDraft}
                      onChange={(patch) =>
                        setEditDraft((current) =>
                          current ? { ...current, ...patch } : current,
                        )
                      }
                    />
                    <Button
                      isDisabled={busy === `edit:${group.slug}`}
                      size="sm"
                      variant="primary"
                      onPress={saveEdit}
                    >
                      {busy === `edit:${group.slug}` ? (
                        <Spinner size="sm" />
                      ) : null}
                      Save group
                    </Button>
                  </div>
                ) : null}

                {deleting ? (
                  <div className="space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
                    <p className="text-xs text-danger">
                      Move {group.modelCount} models before deleting this group.
                    </p>
                    <label className="flex max-w-sm flex-col gap-1 text-xs text-muted">
                      Reassign to
                      <select
                        className="h-10 rounded-xl border border-black/10 bg-background px-3 text-sm text-foreground outline-none focus:border-accent dark:border-white/10"
                        value={reassignTo}
                        onChange={(event) => setReassignTo(event.target.value)}
                      >
                        {destinations.map((candidate) => (
                          <option key={candidate.slug} value={candidate.slug}>
                            {candidate.label} ({candidate.slug})
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      isDisabled={
                        !reassignTo || busy === `delete:${group.slug}`
                      }
                      size="sm"
                      variant="danger-soft"
                      onPress={confirmDelete}
                    >
                      {busy === `delete:${group.slug}` ? (
                        <Spinner size="sm" />
                      ) : null}
                      Delete and reassign
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </Card.Content>
      </Card>
    </div>
  );
}
