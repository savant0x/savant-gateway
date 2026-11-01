import type { Metadata } from "next";
import type { IdentityVerdictStatus } from "@/lib/identity/types";

import { Card, Chip } from "@heroui/react";
import Link from "next/link";

import { IdentityConsole } from "@/components/admin/identity-console";
import { LocalTime } from "@/components/local-time";
import { readIdentityCaps } from "@/lib/identity/estimate";
import { listIdentityTargets } from "@/lib/identity/reads";
import { sweepStaleRuns } from "@/lib/identity/store";
import { statusLabel } from "@/lib/identity/view";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin identity",
  robots: { index: false, follow: false },
};

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

function coverageSummary(value: string | null) {
  if (!value) return "—";

  try {
    const coverage = JSON.parse(value) as Record<string, unknown>;
    let passed = 0;
    let tested = 0;

    for (const entry of Object.values(coverage)) {
      if (entry === null || typeof entry !== "object") continue;

      const state = (entry as { state?: unknown }).state;

      if (typeof state !== "string" || state === "not_tested") continue;

      tested += 1;
      if (state === "pass" || state === "consistent") passed += 1;
    }

    return tested === 0 ? "not tested" : `${passed}/${tested} passed`;
  } catch {
    return "—";
  }
}

export default async function AdminIdentityPage() {
  const caps = readIdentityCaps();
  let storageError: string | null = null;
  let rows: Awaited<ReturnType<typeof listIdentityTargets>> = [];

  try {
    const db = await getDatabase();

    await sweepStaleRuns(db, new Date().toISOString());
    rows = await listIdentityTargets(db);
  } catch (error) {
    storageError =
      error instanceof Error ? error.message : "No database handle.";
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Identity
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Free-pool model checks
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Admin-run probes measure response shape, determinism, canary
            leakage, response distributions, context retrieval, tool calls,
            streaming, and top logprobs where the route returns them. Nothing is
            published until you publish a completed run. A published result is
            advisory evidence about the tested probes; it is not a claim about
            model weights.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {caps.rpm} RPM · {caps.maxRequestsPerModel} per model ·{" "}
          {caps.maxRequestsPerBatch} per batch · {caps.retentionDays}-day sample
          retention
        </div>
      </div>

      {storageError ? (
        <Card variant="secondary">
          <Card.Header>
            <Card.Title>Identity storage is not configured</Card.Title>
            <Card.Description>
              The identity tables live in the same PostgreSQL database as the
              catalog. No run can be created until the handle opens.
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
              {storageError}
            </p>
          </Card.Content>
        </Card>
      ) : (
        <>
          <Card variant="secondary">
            <Card.Header>
              <Card.Title>Runner switch</Card.Title>
              <Card.Description>
                <code>IDENTITY_ENABLED</code> is{" "}
                {caps.enabled ? "true" : "false"}. Creation and start are
                refused with 503 while it is off; completed results can still be
                published or unpublished.
              </Card.Description>
            </Card.Header>
          </Card>

          <IdentityConsole
            caps={{
              enabled: caps.enabled,
              maxRequestsPerBatch: caps.maxRequestsPerBatch,
              maxRequestsPerModel: caps.maxRequestsPerModel,
              rpm: caps.rpm,
            }}
            models={rows.map((row) => ({
              family: row.target.family,
              id: row.target.modelId,
              name: row.target.name,
              providerLabel: row.providerLabel,
            }))}
          />

          <Card variant="secondary">
            <Card.Header>
              <Card.Title>Free-pool targets</Card.Title>
              <Card.Description>
                Only active, published free-pool models served by an enabled
                provider with a configured credential are listed. Paid models
                are refused by the create route.
              </Card.Description>
            </Card.Header>
            <Card.Content className="px-0 pb-0">
              {rows.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-muted">
                  No free-pool target has an enabled, credentialed provider.
                </p>
              ) : (
                <div className="scroll-shell">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th>Provider</th>
                        <th>Last run</th>
                        <th>Coverage</th>
                        <th>Verdict</th>
                        <th>Publication</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.target.modelId}>
                          <td>
                            <div className="font-medium">{row.target.name}</div>
                            <div className="text-[11px] text-muted">
                              {row.target.modelId}
                            </div>
                          </td>
                          <td className="text-muted">{row.providerLabel}</td>
                          <td>
                            {row.lastRun ? (
                              <div className="space-y-0.5">
                                <Chip size="sm" variant="soft">
                                  {row.lastRun.status}
                                </Chip>
                                <div className="text-[11px] text-muted">
                                  <LocalTime value={row.lastRun.createdAt} />
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted">Never run</span>
                            )}
                          </td>
                          <td className="text-muted">
                            {coverageSummary(row.lastRun?.coverageJson ?? null)}
                          </td>
                          <td>
                            {row.verdict ? (
                              <Chip
                                color={verdictColor(row.verdict.status)}
                                size="sm"
                                variant="soft"
                              >
                                {statusLabel(row.verdict.status)}
                              </Chip>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            {row.verdict?.published === 1 ? (
                              <span className="text-success">Published</span>
                            ) : (
                              <span className="text-muted">Not published</span>
                            )}
                          </td>
                          <td className="text-right">
                            {row.lastRun ? (
                              <Link
                                className="text-xs text-accent hover:underline"
                                href={`/admin/identity/${row.lastRun.id}`}
                              >
                                Open run
                              </Link>
                            ) : (
                              <span className="text-xs text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card.Content>
          </Card>
        </>
      )}
    </>
  );
}
