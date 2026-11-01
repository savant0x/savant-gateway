import type { PostgresDatabase } from "../pg-adapter.ts";

import { randomUUID } from "node:crypto";

/**
 * Subscription invoice rows (FID-086 Batch A).
 *
 * The upsert keys on `provider_invoice_id`, which the schema declares unique.
 * Stripe can deliver the same invoice event more than once; updating the
 * existing row keeps one invoice per provider id while still recording a status
 * change (an `open` invoice that later becomes `paid`).
 */

export type InvoiceInput = {
  providerInvoiceId: string | null;
  amountMicros: number;
  currency: string;
  status: "paid" | "failed" | "open" | "void";
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string | null;
};

export async function recordSubscriptionInvoice(
  db: PostgresDatabase,
  subscriptionId: string,
  invoice: InvoiceInput,
) {
  await db
    .prepare(
      `INSERT INTO subscription_invoices
        (id, subscription_id, provider_invoice_id, amount_micros, currency,
         status, period_start, period_end, paid_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (provider_invoice_id) DO UPDATE SET
         subscription_id = excluded.subscription_id,
         amount_micros = excluded.amount_micros,
         currency = excluded.currency,
         status = excluded.status,
         period_start = excluded.period_start,
         period_end = excluded.period_end,
         paid_at = excluded.paid_at`,
    )
    .run(
      `inv_${randomUUID()}`,
      subscriptionId,
      invoice.providerInvoiceId,
      Math.max(0, Math.round(invoice.amountMicros)),
      invoice.currency || "usd",
      invoice.status,
      invoice.periodStart,
      invoice.periodEnd,
      invoice.paidAt,
      new Date().toISOString(),
    );
}
