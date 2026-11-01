import { formatNumber, formatPricePer1M } from "@/components/dashboard/format";
import { trialBalance } from "@/lib/storage/ledger/trials";
import { getDatabase } from "@/lib/storage/runtime";
import { trialOffer } from "@/lib/store-facade/catalog";
import { readTrialConfig } from "@/lib/trials";

export async function TrialCard({ userId }: { userId: string }) {
  const config = readTrialConfig();

  if (!config.enabled) return null;

  const balance = await trialBalance(
    await getDatabase(),
    userId,
    new Date().toISOString(),
  );
  const offers = await Promise.all(
    Object.keys(config.pairs).map(async (id) => ({
      id,
      offer: await trialOffer(id),
    })),
  );

  return (
    <section className="rounded-md border border-border bg-surface p-6">
      <h2 className="text-xl font-semibold">Your one-time trial</h2>
      <p className="mt-2 text-muted">
        {balance.granted > 0
          ? `${formatNumber(balance.remaining)} weighted tokens available · ${formatNumber(balance.used)} used · ${formatNumber(balance.held)} reserved.`
          : "No trial grant has been issued. Trial access requires a verified account and available acquisition capacity."}
      </p>
      <p className="mt-3 text-sm text-muted">
        Your trial is shared across project keys and does not reset daily. When
        a request exceeds the remainder, prepaid credit pays for the whole
        request at these rates. Without sufficient credit, it stops and asks for
        a top-up.
      </p>
      <ul className="mt-4 space-y-2 font-mono text-xs">
        {offers.map(({ id, offer }) =>
          offer ? (
            <li key={id} className="break-all">
              {id}: {formatPricePer1M(offer.input_price_per_1m)} input /{" "}
              {formatPricePer1M(offer.output_price_per_1m)} output per 1M tokens
            </li>
          ) : null,
        )}
      </ul>
    </section>
  );
}
