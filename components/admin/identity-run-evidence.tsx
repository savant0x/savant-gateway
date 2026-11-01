import type { IdentityFindingRecord } from "@/lib/identity/types";

import { Card, Chip } from "@heroui/react";

import { formatNumber } from "@/components/dashboard/format";
import { GATE_STATE_LABELS, findingLabel } from "@/lib/identity/view";

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

function gateState(value: unknown) {
  if (typeof value !== "string") return "not_tested";

  return value in GATE_STATE_LABELS
    ? GATE_STATE_LABELS[value as keyof typeof GATE_STATE_LABELS]
    : value;
}

function findingColor(state: IdentityFindingRecord["state"]) {
  if (state === "pass") return "success" as const;
  if (state === "fail") return "danger" as const;
  if (state === "suspect") return "warning" as const;

  return "default" as const;
}

function coverageRows(coverage: Record<string, unknown> | null) {
  const row = (label: string, key: string) => {
    const gate = record(coverage?.[key]);

    return {
      label,
      state: gateState(gate?.state),
      n: numberValue(gate, "n"),
      note: stringValue(gate, "note"),
      detail: null as string | null,
    };
  };
  const fingerprint = record(coverage?.fingerprint);
  const fingerprintState =
    fingerprint?.state === "consistent"
      ? "passed"
      : fingerprint?.state === "divergent"
        ? "failed"
        : fingerprint
          ? "inconclusive"
          : "not tested";
  const meanJsd = numberValue(fingerprint, "meanJsd");
  const noise = numberValue(fingerprint, "noise");
  const cells = numberValue(fingerprint, "comparableCells");

  return [
    row("Protocol shape", "shape"),
    row("Determinism", "determinism"),
    {
      label: "Response distribution",
      state: fingerprintState,
      n: cells,
      note: stringValue(fingerprint, "note"),
      detail:
        meanJsd === null
          ? null
          : `mean JSD ${meanJsd.toFixed(4)} · noise ${(noise ?? 0).toFixed(4)} · cells ${cells ?? 0} · reference ${stringValue(fingerprint, "referenceProvider") ?? "none"} · control ${fingerprint?.controlPresent ? "present" : "missing"}${fingerprint?.controlDiscriminative ? ", separative" : ""}`,
    },
    row("Canary leakage", "canary"),
    row("Deterministic canaries", "deterministic"),
    row("Context retrieval", "context"),
    row("Tool conformance", "tools"),
    row("Stream integrity", "stream"),
    row("Logprobs", "logprobs"),
  ];
}

/** Coverage and raw findings, split out to stay under the file ceiling. */
export function IdentityRunEvidence({
  coverageJson,
  findings,
}: {
  coverageJson: string | null;
  findings: IdentityFindingRecord[];
}) {
  const gates = coverageRows(parse(coverageJson));

  return (
    <>
      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Coverage</Card.Title>
          <Card.Description>
            Each gate is orthogonal. &quot;Not tested&quot; means the route did
            not support the probe; it is not a pass.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-0 pb-0">
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Gate</th>
                  <th>State</th>
                  <th className="text-right">Probes</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {gates.map((gate) => (
                  <tr key={gate.label}>
                    <td className="font-medium">{gate.label}</td>
                    <td>{gate.state}</td>
                    <td className="text-right text-muted">
                      {formatNumber(gate.n)}
                    </td>
                    <td className="text-[11px] text-muted">
                      {gate.detail ?? gate.note ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card.Content>
      </Card>

      <Card variant="secondary">
        <Card.Header>
          <Card.Title>Findings</Card.Title>
          <Card.Description>
            Raw evidence stays on this page. The public panel receives only the
            sanitized copy from <code>lib/identity/view.ts</code>.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-0 pb-0">
          {findings.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">
              No findings recorded yet.
            </p>
          ) : (
            <div className="scroll-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Metric</th>
                    <th>State</th>
                    <th className="text-right">n</th>
                    <th>Observed</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => (
                    <tr key={finding.id}>
                      <td className="font-medium">
                        {findingLabel(finding.class)}
                      </td>
                      <td className="text-muted">{finding.metric}</td>
                      <td>
                        <Chip
                          color={findingColor(finding.state)}
                          size="sm"
                          variant="soft"
                        >
                          {finding.state}
                        </Chip>
                      </td>
                      <td className="text-right">{finding.n}</td>
                      <td className="text-[11px] text-muted">
                        {finding.observed ?? "—"}
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
  );
}
