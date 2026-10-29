/**
 * The credit-ledger row for a settled request. Kept pure and separate from the
 * store so the arithmetic that makes `balance_after_micros` reconcile with
 * `users.credit_micros` can be tested without a database.
 *
 * Every balance change is written here — grants, top-ups and now settled
 * charges — so the ledger's running balance is the balance a customer sees.
 */
export type UsageLedgerEntry = {
  amountMicros: number;
  balanceAfterMicros: number;
  note: string;
};

export function usageLedgerEntry(input: {
  balanceBeforeMicros: number;
  chargedMicros: number;
  modelId: string;
}): UsageLedgerEntry | null {
  const charge = Math.round(input.chargedMicros);
  const balance = Math.round(input.balanceBeforeMicros);

  // A zero charge is not a balance change and must not appear in the ledger.
  if (!Number.isSafeInteger(charge) || charge <= 0) return null;
  if (!Number.isSafeInteger(balance)) return null;

  return {
    amountMicros: -charge,
    balanceAfterMicros: balance - charge,
    note: `Usage ${input.modelId}`.slice(0, 300),
  };
}
