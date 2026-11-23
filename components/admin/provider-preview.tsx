"use client";

import type { ProviderCatalogPreview } from "@/lib/providers/preview";

import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useEffect, useState } from "react";

import {
  formatMicros,
  formatNumber,
  responseError,
} from "@/components/dashboard/format";

/**
 * Reads a provider's catalog and reports what an import would do.
 *
 * The operator's question before funding an upstream is "which models, at what
 * price, and what would be refused". A provider whose catalog is public can
 * answer it with no credential, so this card does not require one — and says
 * plainly when it read keyless, because a preview is not a working provider.
 */
export function ProviderPreview({
  slug,
  label,
  onClose,
}: {
  slug: string;
  label: string;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ProviderCatalogPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    async function load() {
      const response = await fetch(`/api/admin/providers/${slug}/preview`, {
        method: "POST",
      }).catch(() => null);

      if (!live) return;

      if (!response) {
        setError("The preview request did not complete.");

        return;
      }

      if (!response.ok) {
        setError(await responseError(response));

        return;
      }

      const body = (await response.json().catch(() => null)) as
        (ProviderCatalogPreview & { ok?: boolean }) | null;

      if (live) setPreview(body);
    }

    void load();

    return () => {
      live = false;
    };
  }, [slug]);

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Card.Title>Catalog preview — {label}</Card.Title>
            <Card.Description>
              A read, not an import: the catalog was fetched and counted, and
              nothing was written, enabled or priced. A preview row is not a
              servable model until the provider has a key and a sync.
            </Card.Description>
          </div>
          <Button size="sm" variant="secondary" onPress={onClose}>
            Close
          </Button>
        </div>
      </Card.Header>
      <Card.Content>
        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        {!error && !preview ? (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Spinner size="sm" /> Reading the provider catalog…
          </p>
        ) : null}

        {preview ? <PreviewBody preview={preview} /> : null}
      </Card.Content>
    </Card>
  );
}

function PreviewBody({ preview }: { preview: ProviderCatalogPreview }) {
  const refused = preview.refused;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip
          color={preview.keyless ? "warning" : "success"}
          size="sm"
          variant="soft"
        >
          {preview.keyless ? "read without a key" : "read with the key"}
        </Chip>
        <span className="text-xs text-muted">
          {preview.keyless
            ? "This provider has no credential in this runtime. The read proves the catalog is public; it does not prove the account."
            : "The catalog was read with the provider's configured credential."}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <Fact
          label="Upstream rows"
          value={formatNumber(preview.upstreamRows)}
        />
        <Fact label="Would import" value={formatNumber(preview.imported)} />
        <Fact label="Free-pool rows" value={formatNumber(preview.free)} />
        <Fact label="Paid rows" value={formatNumber(preview.paid)} />
      </dl>

      <div className="text-xs text-muted">
        <p className="font-medium text-foreground">
          What an import would refuse
        </p>
        <p className="mt-1">
          alias-only ids {formatNumber(refused.alias)} · non-text output{" "}
          {formatNumber(refused.media)} · free-pool resale{" "}
          {formatNumber(refused.freePool)}
        </p>
        <p className="mt-1">
          {formatNumber(preview.subscriptionOnly)} imported row(s) carry no
          price and would import disabled until a cost is set.
        </p>
      </div>

      {preview.sample.length > 0 ? (
        <div className="scroll-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Model id</th>
                <th>Family</th>
                <th className="text-right">In /1M</th>
                <th className="text-right">Out /1M</th>
              </tr>
            </thead>
            <tbody>
              {preview.sample.map((row) => (
                <tr key={row.id}>
                  <td className="mono max-w-[28rem] truncate text-[11px]">
                    {row.id}
                  </td>
                  <td className="text-muted">{row.family}</td>
                  <td className="text-right tabular-nums">
                    {row.allowFree ? "free" : formatMicros(row.costInputMicros)}
                  </td>
                  <td className="text-right tabular-nums">
                    {row.allowFree
                      ? "free"
                      : formatMicros(row.costOutputMicros)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  );
}
