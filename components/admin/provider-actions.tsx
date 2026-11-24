"use client";

import type { ProviderSummary } from "@/lib/providers/types";

import { Button, Spinner } from "@heroui/react";

/**
 * The action cell for one provider row.
 *
 * Every row shows the same controls, including Delete on the default provider,
 * because an absent button reads as "this provider cannot be removed" with no
 * explanation. The default provider owns the published catalog identity, so its
 * Delete is disabled and says so (reported 2026-11-24), and any other row can be
 * made the default instead (FID-2026-1124-002).
 */

export function ProviderActions({
  provider,
  busy,
  onSync,
  onPreview,
  onTest,
  onReview,
  onEdit,
  onToggle,
  onRemove,
  onMakeDefault,
}: {
  provider: ProviderSummary;
  busy: string | null;
  onSync: () => void;
  onPreview: () => void;
  onTest: () => void;
  onReview: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onMakeDefault: () => void;
}) {
  const isDefault = provider.isDefault;

  return (
    <div className="flex flex-wrap gap-1.5">
      <Button
        isDisabled={busy !== null || !provider.enabled}
        size="sm"
        variant="primary"
        onPress={onSync}
      >
        {busy === `sync:${provider.slug}` ? <Spinner size="sm" /> : null}
        Sync
      </Button>
      <Button
        isDisabled={busy !== null}
        size="sm"
        variant="secondary"
        onPress={onPreview}
      >
        Preview
      </Button>
      <Button
        isDisabled={busy !== null || !provider.configured}
        size="sm"
        variant="secondary"
        onPress={onTest}
      >
        Test
      </Button>
      {provider.requiresModelReview ? (
        <Button
          isDisabled={busy !== null}
          size="sm"
          variant="secondary"
          onPress={onReview}
        >
          Review
        </Button>
      ) : null}
      <Button
        isDisabled={busy !== null}
        size="sm"
        variant="secondary"
        onPress={onEdit}
      >
        Edit
      </Button>
      <Button
        isDisabled={
          busy !== null || (!provider.enabled && !provider.configured)
        }
        size="sm"
        variant="secondary"
        onPress={onToggle}
      >
        {provider.enabled ? "Disable" : "Enable"}
      </Button>
      {isDefault ? null : (
        <Button
          isDisabled={busy !== null}
          size="sm"
          variant="secondary"
          onPress={onMakeDefault}
        >
          {busy === `default:${provider.slug}` ? <Spinner size="sm" /> : null}
          Make default
        </Button>
      )}
      <Button
        isDisabled={busy !== null || isDefault}
        size="sm"
        variant="danger-soft"
        onPress={onRemove}
      >
        {busy === `delete:${provider.slug}` ? <Spinner size="sm" /> : null}
        Delete
      </Button>
      {isDefault ? (
        <p className="w-full text-[11px] text-muted">
          The default provider cannot be deleted: it owns the published catalog
          identity. Make another provider the default, then delete this one.
        </p>
      ) : null}
    </div>
  );
}
