import type { ModelSummary } from "@/lib/types";

import { Card, Chip } from "@heroui/react";

import { AccessChip } from "./chips";
import { formatNumber } from "./format";

export function ModelsCard({ models }: { models: ModelSummary[] }) {
  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Model catalog</Card.Title>
            <Card.Description>
              Synced from <code className="mono">/v1/models</code> and enriched
              with provider metadata.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {formatNumber(models.length)} models
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {models.length === 0 ? (
          <div className="px-5 pb-5 text-sm text-muted">
            No models yet. Sync the provider to populate the catalog.
          </div>
        ) : (
          <div className="scroll-shell max-h-[26rem]">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Context</th>
                  <th>Weight</th>
                  <th>Access</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {models.map((model) => (
                  <tr key={model.id}>
                    <td>
                      <div className="font-medium">{model.name}</div>
                      <div className="mono mt-0.5 text-[11px] text-muted">
                        {model.id}
                      </div>
                    </td>
                    <td className="text-muted">{model.provider}</td>
                    <td className="text-muted">{model.contextWindow}</td>
                    <td className="text-muted">
                      {model.tokenWeight > 0 ? `${model.tokenWeight}×` : "—"}
                    </td>
                    <td>
                      <AccessChip model={model} />
                    </td>
                    <td className="text-muted">{model.health ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card.Content>
    </Card>
  );
}
