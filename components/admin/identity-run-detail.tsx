import type { IdentityRunDetail } from "@/lib/identity/types";
import type { IdentityVerdictStatus } from "@/lib/identity/types";

import { Card, Chip } from "@heroui/react";
import Link from "next/link";

import { IdentityRunEvidence } from "@/components/admin/identity-run-evidence";
import { IdentityRun } from "@/components/admin/identity-run";
import { StatCard } from "@/components/dashboard/chips";
import { formatMicros, formatNumber } from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";
import { statusLabel } from "@/lib/identity/view";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;

  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

function numberValue(source: Record<string, unknown> | null, key: string) {
  const value = Number(source?.[key]);

  return source && Number.isFinite(value) ? value : null;
}

function stringValue(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];

  return typeof value === "string" ? value : null;
}

function verdictColor(status: IdentityVerdictStatus) {
  if (
    status === "consistent" ||
    status === "self_consistent" ||
    status === "baseline"
  ) {
    return "success" as const;
  }

  if (
    status === "divergent_review" ||
    status === "mismatch_confirmed" ||
    status === "error"
  ) {
    return "danger" as const;
  }

  return "warning" as const;
}

/** Admin run body, split out to keep the page under the 400-line ceiling. */
export function IdentityRunDetail({ detail }: { detail: IdentityRunDetail }) {
  const { run, target, provider, control, findings, verdict, samples } = detail;
  const estimate = parse(run.estimateJson);
  const actual = parse(run.actualJson);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            className="text-xs text-accent hover:underline"
            href="/admin/identity"
          >
            ← All identity checks
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            {target.name}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {target.modelId} · {provider.slug} · {target.protocol} · {run.mode}{" "}
            run
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted">{run.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip size="sm" variant="soft">
            {run.status}
          </Chip>
          {verdict ? (
            <Chip color={verdictColor(verdict.status)} size="sm" variant="soft">
              {statusLabel(verdict.status)}
            </Chip>
          ) : null}
          {verdict?.published === 1 ? (
            <Chip color="success" size="sm" variant="soft">
              Published
            </Chip>
          ) : null}
        </div>
      </div>

      {run.errorClass || run.errorMessage ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {run.errorClass ?? "run_error"}: {run.errorMessage ?? "No detail."}
        </p>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          detail={`${formatNumber(numberValue(estimate, "requests"))} estimated`}
          icon="fa-list-check"
          label="Requests"
          value={formatNumber(actual ? numberValue(actual, "requests") : null)}
        />
        <StatCard
          detail="target + different-model control"
          icon="fa-flask"
          label="Samples"
          value={`${formatNumber(samples.target)} + ${formatNumber(samples.diffControl)}`}
        />
        <StatCard
          detail={verdict ? statusLabel(verdict.status) : "no verdict yet"}
          icon="fa-fingerprint"
          label="Verdict"
          value={verdict ? statusLabel(verdict.status) : "—"}
        />
        <StatCard
          detail={
            verdict?.testedAt
              ? `tested ${verdict.testedAt.slice(0, 10)}`
              : "no publication"
          }
          icon="fa-bullhorn"
          label="Publication"
          value={verdict?.published === 1 ? "Published" : "Not published"}
        />
      </section>

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Run controls</Card.Title>
          <Card.Description>
            Start claims a queued run. Publish requires a completed run, a
            verdict, and a model the catalog still serves. Unpublish and
            confirm-mismatch write a correction row. Confirming a mismatch does
            not publish it.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <IdentityRun
            published={verdict?.published === 1}
            runId={run.id}
            status={run.status}
            verdictStatus={verdict?.status ?? null}
          />
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Target snapshot</Card.Title>
          <Card.Description>
            Stored when the run was created. The live provider record supplies
            the credential at execution time; only the variable name is stored.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Public id", target.modelId],
              ["Upstream id", target.upstreamId],
              ["Provider", `${provider.slug} · ${provider.kind}`],
              ["Protocol", target.protocol],
              ["Family", target.family || "—"],
              ["Context window", target.contextWindow || "—"],
              ["Access", target.access],
              ["Tools", target.supportsTools ? "accepted" : "not advertised"],
              ["Token weight", String(target.tokenWeight)],
              ["Credential variable", provider.keyEnvVar],
              ["Protocol id", run.protocolId],
              ["Reference id", run.referenceId ?? "collected by this run"],
              ["Control model", control?.target.modelId ?? "none"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted">{label}</dt>
                <dd className="break-all font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] text-muted">
            Created <LocalTime value={run.createdAt} /> · started{" "}
            <LocalTime value={run.startedAt} /> · completed{" "}
            <LocalTime value={run.completedAt} />
          </p>
        </Card.Content>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Estimate vs actual</Card.Title>
            <Card.Description>
              Cost is estimated from the sealed battery; this run is paid by the
              upstream free quota, not customer credit.
            </Card.Description>
          </Card.Header>
          <Card.Content className="px-0 pb-0">
            <div className="scroll-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Measure</th>
                    <th className="text-right">Estimate</th>
                    <th className="text-right">Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Requests", "requests"],
                    ["Prompt tokens", "promptTokens"],
                    ["Completion tokens", "completionTokens"],
                    ["Weighted tokens", "weightedTokens"],
                  ].map(([label, key]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td className="text-right text-muted">
                        {formatNumber(numberValue(estimate, key))}
                      </td>
                      <td className="text-right">
                        {formatNumber(numberValue(actual, key))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>Cost</td>
                    <td className="text-right text-muted">
                      {formatMicros(numberValue(estimate, "costMicros"))}
                    </td>
                    <td className="text-right">
                      {formatMicros(numberValue(actual, "costMicros"))}
                    </td>
                  </tr>
                  <tr>
                    <td>Minutes</td>
                    <td className="text-right text-muted">
                      {numberValue(estimate, "minutes") ?? "—"}
                    </td>
                    <td className="text-right">
                      {numberValue(actual, "minutes") ?? "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[11px] text-muted">
              Quota check: {stringValue(estimate, "quotaCheck") ?? "unknown"} ·
              effective mode:{" "}
              {stringValue(estimate, "effectiveMode") ?? run.mode}
            </p>
          </Card.Content>
        </Card>

        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Verdict</Card.Title>
            <Card.Description>
              The summary below is the exact copy stored with the verdict.
            </Card.Description>
          </Card.Header>
          <Card.Content className="space-y-3 text-sm">
            {verdict ? (
              <>
                <p className="whitespace-pre-wrap">{verdict.summary}</p>
                <p className="text-[11px] text-muted">
                  Tested <LocalTime value={verdict.testedAt} /> · valid until{" "}
                  <LocalTime value={verdict.validUntil} /> · published{" "}
                  <LocalTime value={verdict.publishedAt} />
                </p>
              </>
            ) : (
              <p className="text-muted">
                No verdict yet. The runner writes one when it finishes or fails.
              </p>
            )}
          </Card.Content>
        </Card>
      </div>

      <IdentityRunEvidence
        coverageJson={run.coverageJson}
        findings={findings}
      />
    </>
  );
}
