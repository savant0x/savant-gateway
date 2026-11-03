import { execFileSync } from "node:child_process";

export function percentile(values, fraction) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );

  return Math.round(sorted[index] * 100) / 100;
}

export function summarize(label, observations, input = {}) {
  const expected = new Set(input.expectedStatuses ?? [200]);
  const latencies = observations
    .filter((row) => row.status > 0)
    .map((row) => row.latencyMs);
  const statuses = {};

  for (const row of observations) {
    const key = row.status === 0 ? "transport" : String(row.status);

    statuses[key] = (statuses[key] ?? 0) + 1;
  }

  const unexpected = observations.filter((row) => {
    if (row.status === 0) return !(input.allowTransportError ?? false);

    return !expected.has(row.status);
  });

  return {
    label,
    offered: observations.length,
    statuses,
    unexpected: unexpected.length,
    unexpectedExamples: unexpected.slice(0, 5).map((row) => ({
      status: row.status,
      error: row.transportError ?? row.text?.slice(0, 120) ?? null,
    })),
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxLatencyMs: latencies.length ? Math.round(Math.max(...latencies)) : null,
  };
}

export function rssMb(pid) {
  if (!pid) return null;

  try {
    if (process.platform === "win32") {
      const output = execFileSync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { encoding: "utf8", windowsHide: true },
      );
      // CSV columns: image, PID, session, session#, memory. The last quoted
      // field is the only memory reading; the second field is the PID.
      const fields = [...output.matchAll(/"([^"]*)"/g)].map(
        (match) => match[1],
      );
      const memory = fields.at(-1);

      if (!memory) return null;

      const kb = Number(memory.replace(/[^0-9]/g, ""));

      return Number.isFinite(kb) ? Math.round((kb / 1024) * 10) / 10 : null;
    }

    const output = execFileSync("ps", ["-o", "rss=", "-p", String(pid)], {
      encoding: "utf8",
    });
    const kb = Number(output.trim());

    return Number.isFinite(kb) ? Math.round((kb / 1024) * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** The whole disposable database, as the server sees it. */
export async function databaseBytes(database) {
  const row = await database
    .prepare("SELECT pg_database_size(current_database()) AS bytes")
    .get();

  return Number(row?.bytes ?? 0);
}
