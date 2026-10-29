import type { ModelSummary } from "@/lib/types";

import { Card, Chip } from "@heroui/react";

export function AccessChip({ model }: { model: ModelSummary }) {
  if (model.access === "free") {
    return (
      <Chip color="success" size="sm" variant="soft">
        free
      </Chip>
    );
  }

  if (model.access === "subscription") {
    return (
      <Chip color="warning" size="sm" variant="soft">
        subscription
      </Chip>
    );
  }

  return (
    <Chip color="default" size="sm" variant="soft">
      paid
    </Chip>
  );
}

export function StatusChip({ status }: { status: string }) {
  const color =
    status === "active" || status === "ok" || status === "paid"
      ? "success"
      : status === "exhausted" || status === "cancelled" || status === "pending"
        ? "warning"
        : status === "error" || status === "revoked" || status === "failed"
          ? "danger"
          : "default";

  return (
    <Chip color={color} size="sm" variant="soft">
      {status}
    </Chip>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon?: string;
}) {
  return (
    <Card className="min-h-[6.5rem]" variant="secondary">
      <Card.Content className="pt-5">
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted">
          {icon ? (
            <i aria-hidden className={`fa-solid ${icon} text-accent`} />
          ) : null}
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-muted">{detail}</p>
      </Card.Content>
    </Card>
  );
}
