import type { CreditLedgerEntry, TopupSummary } from "@/lib/types";

import { Card } from "@heroui/react";

import { StatusChip } from "@/components/dashboard/chips";
import {
  formatDate,
  formatMicros,
  formatSignedMicros,
} from "@/components/dashboard/format";

export function BillingHistory({
  ledger,
  topups,
}: {
  ledger: CreditLedgerEntry[];
  topups: TopupSummary[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card>
        <Card.Header>
          <Card.Title>Credit ledger</Card.Title>
          <Card.Description>
            Every balance change, newest first. Requests debit the settled
            charge; top-ups credit only after payment is confirmed.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-0 pb-0">
          {ledger.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">
              No credit activity yet.
            </p>
          ) : (
            <div className="scroll-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Kind</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Balance</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-muted">
                        {formatDate(entry.createdAt)}
                      </td>
                      <td className="text-muted">{entry.kind}</td>
                      <td
                        className={`text-right ${
                          entry.amountMicros >= 0
                            ? "text-success"
                            : "text-foreground"
                        }`}
                      >
                        {formatSignedMicros(entry.amountMicros)}
                      </td>
                      <td className="text-right text-muted">
                        {formatMicros(entry.balanceAfterMicros)}
                      </td>
                      <td className="max-w-[16rem] truncate text-muted">
                        {entry.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Top-ups</Card.Title>
          <Card.Description>
            Stripe checkouts for this account. A pending row has not been
            credited.
          </Card.Description>
        </Card.Header>
        <Card.Content className="px-0 pb-0">
          {topups.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted">
              No top-ups yet. Add credit to run paid models.
            </p>
          ) : (
            <div className="scroll-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th>Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.map((topup) => (
                    <tr key={topup.id}>
                      <td className="whitespace-nowrap text-muted">
                        {formatDate(topup.createdAt)}
                      </td>
                      <td className="text-right">
                        {formatMicros(topup.amountMicros)}
                      </td>
                      <td>
                        <StatusChip status={topup.status} />
                      </td>
                      <td className="whitespace-nowrap text-muted">
                        {formatDate(topup.paidAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>
    </section>
  );
}
