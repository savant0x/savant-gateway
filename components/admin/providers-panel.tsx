"use client";

import type { ProviderSummary } from "@/lib/providers/types";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  draftFromProvider,
  EMPTY_PROVIDER,
  ProviderForm,
  providerPayload,
  type ProviderDraft,
} from "@/components/admin/provider-form";
import { ProviderEligibility } from "@/components/admin/provider-eligibility";
import { ProviderPreview } from "@/components/admin/provider-preview";
import { StatusChip } from "@/components/dashboard/chips";
import { formatNumber, responseError } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";
import { adminLoginHref } from "@/lib/admin-return";

export function AdminProvidersPanel({
  providers,
}: {
  providers: ProviderSummary[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_PROVIDER);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    slug: string;
    label: string;
  } | null>(null);
  const [previewing, setPreviewing] = useState<{
    slug: string;
    label: string;
  } | null>(null);

  async function send(url: string, method: string, payload?: unknown) {
    const response = await fetch(url, {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (response.status === 401) {
      router.replace(
        adminLoginHref(`${window.location.pathname}${window.location.search}`),
      );
    }

    if (!response.ok) throw new Error(await responseError(response));

    return (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
  }

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);

    try {
      setNotice(await action());
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action failed.");
    } finally {
      setBusy(null);
    }
  }

  function sync(slug: string) {
    return run(`sync:${slug}`, async () => {
      const result = await send(`/api/admin/providers/${slug}/sync`, "POST");

      return `Synced ${slug}: ${formatNumber(Number(result?.imported ?? 0))} models.`;
    });
  }

  function test(slug: string) {
    return run(`test:${slug}`, async () => {
      const result = await send(`/api/admin/providers/${slug}/test`, "POST");

      return `${slug} answered with ${formatNumber(Number(result?.models ?? 0))} models.`;
    });
  }

  function toggle(provider: ProviderSummary) {
    return run(`toggle:${provider.slug}`, async () => {
      const result = await send(
        `/api/admin/providers/${provider.slug}`,
        "PATCH",
        {
          enabled: !provider.enabled,
        },
      );

      return `${provider.label} ${provider.enabled ? "disabled" : "enabled"}.${syncNote(result)}`;
    });
  }

  function remove(provider: ProviderSummary) {
    if (
      !window.confirm(
        `Delete ${provider.label} and its catalog rows? Usage history is kept.`,
      )
    ) {
      return Promise.resolve();
    }

    return run(`delete:${provider.slug}`, async () => {
      await send(`/api/admin/providers/${provider.slug}`, "DELETE");

      return `${provider.label} deleted.`;
    });
  }

  function submit() {
    return run("save", async () => {
      const result = editing
        ? await send(
            `/api/admin/providers/${editing}`,
            "PATCH",
            providerPayload(draft),
          )
        : await send("/api/admin/providers", "POST", providerPayload(draft));

      const saved = editing ? "updated" : "created";

      setDraft(EMPTY_PROVIDER);
      setEditing(null);

      return `Provider ${saved}.${syncNote(result)}`;
    });
  }

  /**
   * The save may have read the catalog on its own (a provider that can now
   * serve). Saying so is the difference between "the key took" and a zero the
   * operator reads as a broken key.
   */
  function syncNote(result: Record<string, unknown> | null) {
    const error =
      typeof result?.syncError === "string" ? result.syncError : null;

    if (error) return ` Catalog not read: ${error}`;

    const sync = result?.sync as Record<string, unknown> | undefined;

    if (!sync) return "";

    return ` Imported ${formatNumber(Number(sync.imported ?? 0))} models.`;
  }

  function edit(provider: ProviderSummary) {
    setEditing(provider.slug);
    setDraft(draftFromProvider(provider));
    setError(null);
    setNotice(null);
  }

  function cancel() {
    setEditing(null);
    setDraft(EMPTY_PROVIDER);
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
          <Card.Title>Upstream providers</Card.Title>
          <Card.Description>
            Each provider names the environment variable that holds its key; the
            value lives in <span className="mono">.env.local</span> and is never
            stored here or returned by this page. Enabling a provider reads its
            catalog once, immediately.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Kind</th>
                  <th>Key variable</th>
                  <th>Status</th>
                  <th className="text-right">Models</th>
                  <th>Last sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.slug}>
                    <td className="max-w-[22rem]">
                      <p className="font-medium">
                        {provider.label}{" "}
                        {!provider.enabled ? (
                          <Chip color="default" size="sm" variant="soft">
                            disabled
                          </Chip>
                        ) : null}{" "}
                        {provider.requiresModelReview ? (
                          <Chip color="warning" size="sm" variant="soft">
                            review required
                          </Chip>
                        ) : null}
                      </p>
                      <p className="mono truncate text-[11px] text-muted">
                        {provider.slug} · {provider.baseUrl}
                      </p>
                      {provider.error ? (
                        <p className="mt-1 text-[11px] text-warning">
                          {provider.error}
                        </p>
                      ) : null}
                    </td>
                    <td className="text-muted">{provider.kind}</td>
                    <td>
                      <span className="mono text-xs">{provider.keyEnvVar}</span>
                      <p className="mt-1 text-[11px] text-muted">
                        {provider.configured
                          ? "this runtime sees the key"
                          : `missing: set ${provider.keyEnvVar || "its variable"} in .env.local, then restart`}
                      </p>
                    </td>
                    <td>
                      <StatusChip status={provider.status} />
                    </td>
                    <td className="text-right">{provider.modelCount}</td>
                    <td className="whitespace-nowrap text-muted">
                      <LocalTime value={provider.syncedAt} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          isDisabled={busy !== null || !provider.enabled}
                          size="sm"
                          variant="primary"
                          onPress={() => sync(provider.slug)}
                        >
                          {busy === `sync:${provider.slug}` ? (
                            <Spinner size="sm" />
                          ) : null}
                          Sync
                        </Button>
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() =>
                            setPreviewing({
                              slug: provider.slug,
                              label: provider.label,
                            })
                          }
                        >
                          Preview
                        </Button>
                        <Button
                          isDisabled={busy !== null || !provider.configured}
                          size="sm"
                          variant="secondary"
                          onPress={() => test(provider.slug)}
                        >
                          Test
                        </Button>
                        {provider.requiresModelReview ? (
                          <Button
                            isDisabled={busy !== null}
                            size="sm"
                            variant="secondary"
                            onPress={() =>
                              setReviewing({
                                slug: provider.slug,
                                label: provider.label,
                              })
                            }
                          >
                            Review
                          </Button>
                        ) : null}
                        <Button
                          isDisabled={busy !== null}
                          size="sm"
                          variant="secondary"
                          onPress={() => edit(provider)}
                        >
                          Edit
                        </Button>
                        <Button
                          isDisabled={
                            busy !== null ||
                            (!provider.enabled && !provider.configured)
                          }
                          size="sm"
                          variant="secondary"
                          onPress={() => toggle(provider)}
                        >
                          {provider.enabled ? "Disable" : "Enable"}
                        </Button>
                        {provider.slug === "savant" ? null : (
                          <Button
                            isDisabled={busy !== null}
                            size="sm"
                            variant="danger-soft"
                            onPress={() => remove(provider)}
                          >
                            {busy === `delete:${provider.slug}` ? (
                              <Spinner size="sm" />
                            ) : null}
                            Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>

      {reviewing ? (
        <ProviderEligibility
          label={reviewing.label}
          slug={reviewing.slug}
          onClose={() => setReviewing(null)}
        />
      ) : null}

      {previewing ? (
        <ProviderPreview
          label={previewing.label}
          slug={previewing.slug}
          onClose={() => setPreviewing(null)}
        />
      ) : null}

      <ProviderForm
        busy={busy}
        draft={draft}
        editing={editing}
        onCancel={cancel}
        onChange={setDraft}
        onSubmit={submit}
      />
    </div>
  );
}
