import type { CustomerSummary, TopupSummary } from "@/lib/types";

import { Card } from "@heroui/react";

import { StatusChip } from "@/components/dashboard/chips";
import {
  formatDate,
  formatMicros,
  formatNumber,
} from "@/components/dashboard/format";

export function CustomersTable({
  customers,
}: {
  customers: CustomerSummary[];
}) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Customers</Card.Title>
        <Card.Description>
          Accounts created through signup. Credit is prepaid; every key and
          usage row belongs to one customer.
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {customers.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">
            No customer accounts yet. They appear here after signup.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="text-right">Credit</th>
                  <th className="text-right">Held</th>
                  <th className="text-right">Keys</th>
                  <th className="text-right">Requests</th>
                  <th className="text-right">Charged</th>
                  <th>Last top-up</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <div className="font-medium">{customer.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {customer.email}
                      </div>
                      <div className="mono mt-0.5 text-[10px] text-muted">
                        {customer.id}
                      </div>
                    </td>
                    <td>
                      <StatusChip status={customer.status} />
                    </td>
                    <td className="text-right">
                      {formatMicros(customer.creditMicros)}
                    </td>
                    <td className="text-right text-muted">
                      {formatMicros(customer.heldMicros)}
                    </td>
                    <td className="text-right text-muted">
                      {formatNumber(customer.keyCount)}
                    </td>
                    <td className="text-right text-muted">
                      {formatNumber(customer.requestCount)}
                    </td>
                    <td className="text-right text-muted">
                      {formatMicros(customer.chargedMicros)}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(customer.lastTopupAt)}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(customer.createdAt)}
                    </td>
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

export function AdminTopupsTable({ topups }: { topups: TopupSummary[] }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Recent top-ups</Card.Title>
        <Card.Description>
          Stripe checkouts across all customers. Only a paid row has crediting
          evidence.
        </Card.Description>
      </Card.Header>
      <Card.Content className="px-0 pb-0">
        {topups.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted">
            No top-ups recorded yet.
          </p>
        ) : (
          <div className="scroll-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Customer</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th>Provider ref</th>
                </tr>
              </thead>
              <tbody>
                {topups.map((topup) => (
                  <tr key={topup.id}>
                    <td className="whitespace-nowrap text-muted">
                      {formatDate(topup.createdAt)}
                    </td>
                    <td>
                      <div className="font-medium">{topup.customerName}</div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {topup.customerEmail}
                      </div>
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
                    <td
                      className="mono max-w-[14rem] truncate text-[10px] text-muted"
                      title={topup.providerRef}
                    >
                      {topup.providerRef}
                    </td>
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
