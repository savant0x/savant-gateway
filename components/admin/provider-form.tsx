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
  balance: boolean;
  subscription: boolean;
  pricing: boolean;
};

export const EMPTY_PROVIDER: ProviderDraft = {
  slug: "",
  label: "",
  kind: "openai",
  baseUrl: "https://",
  keyEnvVar: "",
  defaultHeaders: {},
  balance: true,
  subscription: true,
  pricing: true,
};

export function draftFromProvider(provider: ProviderSummary): ProviderDraft {
  return {
    slug: provider.slug,
    label: provider.label,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    keyEnvVar: provider.keyEnvVar,
    defaultHeaders: provider.defaultHeaders,
    balance: provider.capabilities.balance,
    subscription: provider.capabilities.subscription,
    pricing: provider.capabilities.pricing,
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

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>
          {editing ? `Edit ${editing}` : "Register a provider"}
        </Card.Title>
        <Card.Description>
          A provider is enabled when its key variable is present in .env.local.
          Leave the key out of this form; only its variable name belongs here.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          {!editing ? field("slug", "Slug", draft.slug) : null}
          {field("label", "Label", draft.label)}
          {field("baseUrl", "Base URL", draft.baseUrl)}
          {field("keyEnvVar", "Key environment variable", draft.keyEnvVar)}
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
              ["balance", "Balance endpoint"],
              ["subscription", "Subscription endpoint"],
              ["pricing", "Published pricing"],
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
