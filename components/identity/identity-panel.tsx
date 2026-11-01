import type { IdentityPublishedView } from "@/lib/identity/types";

import Link from "next/link";
import { Card, Chip } from "@heroui/react";

import { formatCalendarDay } from "@/components/dashboard/format";
import { GATE_STATE_LABELS } from "@/lib/identity/view";

/**
 * Public identity panel (FID-087).
 *
 * Receives plain data from a server component. It never shows JSD values,
 * e-values, raw samples, or control internals — those stay on the admin run
 * page. The copy comes from `view.ts`, so the panel cannot invent a claim the
 * runner does not support.
 */
export function IdentityPanel({
  view,
  unavailable = false,
}: {
  view: IdentityPublishedView | null;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return (
      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Model identity</Card.Title>
          <Card.Description>
            Identity results are unavailable right now. The model itself is
            unaffected; this panel only reads published checks.
          </Card.Description>
        </Card.Header>
      </Card>
    );
  }

  if (!view) {
    return (
      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Model identity</Card.Title>
          <Card.Description>
            No identity result has been published for this model. The operator
            runs checks on free-pool routes and publishes a result only after
            review.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <Link
            className="text-sm text-accent underline-offset-4 hover:underline"
            href="/identity"
          >
            Read the methodology and correction ledger
          </Link>
        </Card.Content>
      </Card>
    );
  }

  const warning =
    view.status === "divergent_review" || view.status === "mismatch_confirmed";

  return (
    <Card variant="secondary">
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Card.Title>Model identity</Card.Title>
            <Card.Description>
              Advisory evidence from a dated probe run, not a guarantee of model
              weights.
            </Card.Description>
          </div>
          <Chip
            color={warning ? "warning" : "default"}
            size="sm"
            variant="soft"
          >
            {view.statusLabel}
          </Chip>
        </div>
      </Card.Header>

      <Card.Content className="space-y-5">
        <p className="text-sm leading-6 text-muted">{view.summary}</p>

        <dl className="grid gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted">Tested</dt>
            <dd className="mt-1 font-medium">
              {formatCalendarDay(view.testedAt)}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted">
              Valid until
            </dt>
            <dd className="mt-1 font-medium">
              {formatCalendarDay(view.validUntil)}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted">Protocol</dt>
            <dd className="mono mt-1 font-medium">{view.protocolId}</dd>
          </div>
        </dl>

        {view.claims.length > 0 ? (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              What the run supports
            </h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
              {view.claims.map((claim) => (
                <li key={claim}>{claim}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            What this does not claim
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
            {view.limits.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {view.findings.map((finding) => (
            <div
              key={finding.class}
              className="rounded-lg border border-black/10 px-3 py-2 text-sm dark:border-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{finding.label}</span>
                <span className="text-[11px] uppercase tracking-[0.1em] text-muted">
                  {GATE_STATE_LABELS[finding.state]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted">
                {finding.detail}
              </p>
            </div>
          ))}
        </div>

        <Link
          className="inline-block text-sm text-accent underline-offset-4 hover:underline"
          href="/identity"
        >
          Methodology, limits, and the correction ledger
        </Link>
      </Card.Content>
    </Card>
  );
}
