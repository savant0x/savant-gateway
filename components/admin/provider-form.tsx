"use client";

import type { ProviderSummary } from "@/lib/providers/types";

import { Button, Card, Input, Spinner } from "@heroui/react";

type Kind = "openai" | "anthropic" | "both";

export type ProviderDraft = {
  slug: string;
  label: string;
  kind: Kind;
  baseUrl: string;
  keyEnvVar: string;
  defaultHeaders: Record<string, string>;
  balanceUrl: string;
  catalogUrl: string;
  balance: boolean;
  subscription: boolean;
  pricing: boolean;
  requiresModelReview: boolean;
};

export const EMPTY_PROVIDER: ProviderDraft = {
  slug: "",
  label: "",
  kind: "openai",
  baseUrl: "https://",
  keyEnvVar: "",
  defaultHeaders: {},
  balanceUrl: "",
  catalogUrl: "",
  balance: false,
  subscription: false,
  pricing: false,
  requiresModelReview: false,
};

export function draftFromProvider(provider: ProviderSummary): ProviderDraft {
  return {
    slug: provider.slug,
    label: provider.label,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    keyEnvVar: provider.keyEnvVar,
    defaultHeaders: provider.defaultHeaders,
    balanceUrl: provider.balanceUrl ?? "",
    catalogUrl: provider.catalogUrl ?? "",
    balance: provider.capabilities.balance,
    subscription: provider.capabilities.subscription,
    pricing: provider.capabilities.pricing,
    requiresModelReview: provider.requiresModelReview,
  };
}

export function providerPayload(draft: ProviderDraft) {
  return {
    slug: draft.slug,
    label: draft.label,
    kind: draft.kind,
    baseUrl: draft.baseUrl,
    keyEnvVar: draft.keyEnvVar,
    defaultHeaders: draft.defaultHeaders,
    balanceUrl: draft.balanceUrl.trim(),
    catalogUrl: draft.catalogUrl.trim(),
    requiresModelReview: draft.requiresModelReview,
    capabilities: {
      balance: draft.balance,
      subscription: draft.subscription,
      pricing: draft.pricing,
    },
  };
}

export function ProviderForm({
  draft,
  editing,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: ProviderDraft;
  editing: string | null;
  busy: string | null;
  onChange: (draft: ProviderDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  function field(key: keyof ProviderDraft, label: string, value: string) {
    return (
      <Input
        key={key}
        aria-label={label}
        placeholder={label}
        value={value}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
      />
    );
  }

  function setHeader(next: Record<string, string>) {
    onChange({ ...draft, defaultHeaders: next });
  }

  function renameHeader(from: string, to: string) {
    const next: Record<string, string> = {};

    for (const [name, value] of Object.entries(draft.defaultHeaders)) {
      next[name === from ? to : name] = value;
    }

    setHeader(next);
  }

  function removeHeader(name: string) {
    const next = { ...draft.defaultHeaders };

    delete next[name];
    setHeader(next);
  }

  /** The placeholder name is unique so two new rows cannot collapse into one. */
  function addHeader() {
    let index = Object.keys(draft.defaultHeaders).length + 1;
    let name = `header-${index}`;

    while (name in draft.defaultHeaders) {
      index += 1;
      name = `header-${index}`;
    }

    setHeader({ ...draft.defaultHeaders, [name]: "" });
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>
          {editing ? `Edit ${editing}` : "Register a provider"}
        </Card.Title>
        <Card.Description>
          A provider can be enabled only when its key variable is present in
          this runtime&apos;s environment. Leave the key out of this form; only
          its variable name belongs here.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <p className="text-xs text-muted">
          The field above takes the variable&apos;s <em>name</em>. The value
          itself lives in <span className="mono">.env.local</span> as
          <span className="mono"> {draft.keyEnvVar || "VARIABLE_NAME"}=…</span>;
          this page never stores or returns it. Adding or changing the value
          needs a restart of the runtime that reads it.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {!editing ? field("slug", "Slug", draft.slug) : null}
          {field("label", "Label", draft.label)}
          {field("baseUrl", "Base URL", draft.baseUrl)}
          {field(
            "keyEnvVar",
            "Key environment variable name (not the key)",
            draft.keyEnvVar,
          )}
          {field("balanceUrl", "Balance URL (optional)", draft.balanceUrl)}
          {field(
            "catalogUrl",
            "Catalog groups URL (optional)",
            draft.catalogUrl,
          )}
          <label className="text-xs text-muted">
            Protocol
            <select
              className="mt-1 w-full rounded-lg border border-white/10 bg-surface px-3 py-2 text-sm text-foreground"
              value={draft.kind}
              onChange={(event) =>
                onChange({ ...draft, kind: event.target.value as Kind })
              }
            >
              <option value="openai">OpenAI Chat Completions</option>
              <option value="anthropic">Anthropic Messages</option>
              <option value="both">Both (per model)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 text-xs text-muted">
          {(
            [
              [
                "balance",
                "Balance endpoint (polls the balance URL for balance and RPM)",
              ],
              [
                "subscription",
                "Subscription endpoint (polls quota; enables quota admission)",
              ],
              [
                "pricing",
                "Published pricing (syncs upstream cost into the price table)",
              ],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2">
              <input
                checked={draft[key]}
                type="checkbox"
                onChange={(event) =>
                  onChange({ ...draft, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input
              checked={draft.requiresModelReview}
              type="checkbox"
              onChange={(event) =>
                onChange({
                  ...draft,
                  requiresModelReview: event.target.checked,
                })
              }
            />
            Require a decision per imported model
          </label>
        </div>
        <p className="text-xs text-muted">
          Every capability starts unchecked because the schema starts there. A
          provider with none checked still serves calls; it reports no balance,
          no quota and no upstream cost. Cost then stays unknown, so imported
          rows arrive disabled until you price them, and admission needs a
          configured ceiling or <code>PROVIDER_SHARED_RPM</code>.
        </p>
        <p className="text-xs text-muted">
          With <strong>Require a decision</strong> on, every imported row stays
          unpublished until an operator records a dated decision for it. That is
          the gate for a provider whose terms require per-model approval.
        </p>
        <p className="text-xs text-muted">
          No <code className="mx-1">free/</code> row is imported from any
          provider: the gateway sells no free capacity, and the marketplaces
          forbid reselling theirs. The sync warning reports how many were
          refused.
        </p>
        <p className="text-xs text-muted">
          Set <strong>Balance URL</strong> only when the provider publishes its
          balance somewhere other than <code>/balance</code> on the base URL. It
          is called with this provider&apos;s key and must not carry a
          credential of its own.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground">Default headers</p>
          <p className="text-xs text-muted">
            Sent with every request to this provider. Names must be unique and
            values are exact. A credential never belongs here; it is read from
            the key variable above.
          </p>
          {Object.entries(draft.defaultHeaders).length === 0 ? (
            <p className="text-xs text-muted">No default headers.</p>
          ) : null}
          {Object.entries(draft.defaultHeaders).map(([name, value], index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Header name"
                placeholder="Header name"
                value={name}
                onChange={(event) => renameHeader(name, event.target.value)}
              />
              <Input
                aria-label={`Value for ${name}`}
                placeholder="Value"
                value={value}
                onChange={(event) =>
                  setHeader({
                    ...draft.defaultHeaders,
                    [name]: event.target.value,
                  })
                }
              />
              <Button variant="secondary" onPress={() => removeHeader(name)}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="secondary" onPress={addHeader}>
            Add header
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            isDisabled={busy !== null}
            variant="primary"
            onPress={onSubmit}
          >
            {busy === "save" ? <Spinner size="sm" /> : null}
            {editing ? "Save provider" : "Add provider"}
          </Button>
          {editing ? (
            <Button variant="secondary" onPress={onCancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );
}
