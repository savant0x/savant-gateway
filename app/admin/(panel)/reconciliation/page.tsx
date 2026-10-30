import type { Metadata } from "next";

import { microsToPrice } from "@/lib/pricing";
import { getReconciliation, listBalanceBaselines } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin — Reconciliation",
  robots: { index: false, follow: false },
};

function usd(micros: number) {
  return `$${microsToPrice(micros).toFixed(4)}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 font-mono text-sm text-white/90">{value}</p>
    </div>
  );
}

/**
 * Financial reconciliation: the customer balance must equal the recorded
 * baseline plus every ledger entry. A difference is shown, never tuned away.
 */
export default function ReconciliationPage() {
  const report = getReconciliation();
  const baselines = listBalanceBaselines(10);
  const unbalanced = report.accounts.filter((account) => !account.balanced);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">Financial reconciliation</h1>
        <p className="text-sm text-white/60">
          {report.totals.balanced
            ? "Every account balance equals its baseline plus ledger sum."
            : `${unbalanced.length} account(s) disagree with their ledger.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Customer balance"
          value={usd(report.totals.balanceMicros)}
        />
        <Stat
          label="Baseline + ledger"
          value={usd(report.totals.expectedMicros)}
        />
        <Stat label="Difference" value={usd(report.totals.differenceMicros)} />
        <Stat
          label="Usage debits"
          value={usd(report.totals.usageDebitsMicros)}
        />
        <Stat label="Paid top-ups" value={usd(report.totals.topupMicros)} />
        <Stat label="Active holds" value={usd(report.totals.heldMicros)} />
        <Stat
          label="Quarantined"
          value={usd(report.totals.quarantinedMicros)}
        />
        <Stat
          label="Refunds & corrections"
          value={usd(report.totals.adjustmentMicros)}
        />
        <Stat label="Baselines recorded" value={String(baselines.length)} />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Differences</h2>
        {unbalanced.length === 0 ? (
          <p className="text-sm text-white/60">No differences.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-white/50">
              <tr>
                <th className="py-1">Account</th>
                <th className="py-1">Balance</th>
                <th className="py-1">Baseline + ledger</th>
                <th className="py-1">Difference</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {unbalanced.map((account) => (
                <tr key={account.userId} className="border-t border-white/10">
                  <td className="py-1">{account.userId}</td>
                  <td className="py-1">{usd(account.balanceMicros)}</td>
                  <td className="py-1">
                    {usd(account.baselineMicros + account.ledgerMicros)}
                  </td>
                  <td className="py-1">{usd(account.differenceMicros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Recorded baselines</h2>
        {baselines.length === 0 ? (
          <p className="text-sm text-white/60">
            None. A baseline is only for history that predates ledger coverage.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {baselines.map((row) => (
              <li key={String(row.id)} className="font-mono">
                {String(row.user_id)} — {usd(Number(row.baseline_micros))} —{" "}
                {String(row.created_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
