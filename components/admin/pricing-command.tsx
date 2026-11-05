"use client";

import type {
  PricingCommandData,
  PricingSortDirection,
  PricingSortKey,
} from "@/lib/pricing-command";

import { Card, Chip } from "@heroui/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  formatCalendarDay,
  formatCompact,
  formatMarginPercent,
  formatMicros,
  formatNumber,
  formatPricePer1M,
} from "@/components/dashboard/format";
import { Pagination } from "@/components/ui/pagination";
import { StatePanel } from "@/components/ui/state-panel";
import {
  PRICING_COMMAND_PAGE_SIZE,
  PRICING_COMMAND_WINDOWS,
  paginatePricingRows,
  sortPricingRows,
} from "@/lib/pricing-command";

/**
 * Realized pricing command center (FID-2026-1105-005).
 *
 * The table answers "which models are actually making money at the prices we
 * charge?", not "which prices look good on paper". Every total is settled
 * credit revenue against recorded cost. The coverage figure is as important as
 * the contribution figure: a row with an unknown cost basis keeps its revenue
 * and contributes no cost, so the total is a floor until the operator fixes the
 * basis.
 */

const SORTS: Array<{ key: PricingSortKey; label: string }> = [
  { key: "contribution", label: "Contribution" },
  { key: "revenue", label: "Revenue" },
  { key: "requests", label: "Requests" },
  { key: "tokens", label: "Tokens" },
  { key: "margin", label: "Margin" },
  { key: "name", label: "Model name" },
];

export function PricingCommand({ data }: { data: PricingCommandData }) {
  const [sort, setSort] = useState<PricingSortKey>("contribution");
  const [direction, setDirection] = useState<PricingSortDirection>("desc");
  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () => sortPricingRows(data.rows, sort, direction),
    [data.rows, direction, sort],
  );
  const paged = paginatePricingRows(sorted, page, PRICING_COMMAND_PAGE_SIZE);
  const { summary } = data;

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Realized pricing command center</Card.Title>
            <Card.Description>
              Settled credit revenue, recorded upstream cost and contribution
              per model for the trailing UTC window. A cost basis that is
              unknown is counted as unknown, never as zero.
            </Card.Description>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRICING_COMMAND_WINDOWS.map((days) => (
              <Link
                key={days}
                aria-current={data.rangeDays === days ? "page" : undefined}
                className={`rounded-lg border px-2.5 py-1 text-xs ${
                  data.rangeDays === days
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
                }`}
                href={`?window=${days}`}
              >
                {days} days
              </Link>
            ))}
          </div>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-black/10 bg-surface p-3 dark:border-white/10">
            <dt className="text-[11px] font-medium text-muted">
              Settled credit revenue
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatMicros(summary.revenueMicros)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              {formatNumber(summary.requests)} credit-billed calls ·{" "}
              {summary.models} models
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-surface p-3 dark:border-white/10">
            <dt className="text-[11px] font-medium text-muted">
              Recorded upstream cost
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatMicros(summary.costMicros)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              {formatMarginPercent(summary.marginBps)} margin on known-cost
              revenue
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-surface p-3 dark:border-white/10">
            <dt className="text-[11px] font-medium text-muted">Contribution</dt>
            <dd
              className={`mt-1 text-lg font-semibold tabular-nums ${
                summary.contributionMicros < 0 ? "text-danger" : ""
              }`}
            >
              {formatMicros(summary.contributionMicros)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              Revenue minus recorded cost
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-surface p-3 dark:border-white/10">
            <dt className="text-[11px] font-medium text-muted">
              Cost coverage
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {(summary.coverageBps / 100).toFixed(1)}%
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              {formatNumber(summary.unknownCostRequests)} calls with an unknown
              cost basis
            </dd>
          </div>
        </dl>

        {data.rows.length === 0 ? (
          <StatePanel
            description="There are no credit-billed calls in this window. Free and included plan usage are reported on their own surfaces, not here."
            state="empty"
            title="No settled credit calls in this window."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label
                    className="block text-[11px] font-medium text-muted"
                    htmlFor="pricing-command-sort"
                  >
                    Sort by
                  </label>
                  <select
                    className="mt-1 h-9 rounded-lg border border-black/10 bg-background px-2.5 text-xs outline-none focus:border-accent dark:border-white/10"
                    id="pricing-command-sort"
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as PricingSortKey);
                      setPage(1);
                    }}
                  >
                    {SORTS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="h-9 rounded-lg border border-black/10 px-3 text-xs text-muted hover:text-foreground dark:border-white/10"
                  type="button"
                  onClick={() => {
                    setDirection((current) =>
                      current === "desc" ? "asc" : "desc",
                    );
                    setPage(1);
                  }}
                >
                  {direction === "desc" ? "High to low" : "Low to high"}
                </button>
              </div>
              <p className="text-[11px] text-muted">
                Winning rows are live prices; comparison freshness is shown per
                row.
              </p>
            </div>

            <div className="scroll-shell">
              <table className="data-table">
                <caption className="sr-only">
                  Settled credit revenue, recorded cost and contribution by
                  model for the selected window
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th className="text-right" scope="col">
                      Calls
                    </th>
                    <th className="text-right" scope="col">
                      Tokens
                    </th>
                    <th className="text-right" scope="col">
                      Revenue
                    </th>
                    <th className="text-right" scope="col">
                      Recorded cost
                    </th>
                    <th className="text-right" scope="col">
                      Contribution
                    </th>
                    <th className="text-right" scope="col">
                      Margin
                    </th>
                    <th scope="col">Sell / cost per 1M</th>
                    <th scope="col">Cost basis</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((row) => (
                    <tr key={row.modelId}>
                      <td className="max-w-[18rem]">
                        <p className="truncate font-medium">{row.modelName}</p>
                        <p className="mono mt-0.5 truncate text-[11px] text-muted">
                          {row.modelId} · {row.groupSlug}
                        </p>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatNumber(row.requests)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatCompact(row.inputTokens + row.outputTokens)}
                        <p className="text-[11px] text-muted">
                          {formatCompact(row.inputTokens)} in ·{" "}
                          {formatCompact(row.outputTokens)} out
                        </p>
                      </td>
                      <td className="text-right tabular-nums">
                        {formatMicros(row.revenueMicros)}
                      </td>
                      <td className="text-right tabular-nums">
                        {row.costMicros === null
                          ? "unknown"
                          : formatMicros(row.costMicros)}
                      </td>
                      <td
                        className={`text-right tabular-nums ${
                          row.contributionMicros !== null &&
                          row.contributionMicros < 0
                            ? "text-danger"
                            : ""
                        }`}
                      >
                        {row.contributionMicros === null
                          ? "—"
                          : formatMicros(row.contributionMicros)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatMarginPercent(row.marginBps)}
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        <p>
                          {formatPricePer1M(row.sellInputMicros / 1_000_000)} /{" "}
                          {formatPricePer1M(row.sellOutputMicros / 1_000_000)}
                        </p>
                        <p className="text-[11px] text-muted">
                          {formatPricePer1M(row.costInputMicros / 1_000_000)} /{" "}
                          {formatPricePer1M(row.costOutputMicros / 1_000_000)}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        {row.costSource === "unknown" ? (
                          <Chip color="warning" size="sm" variant="soft">
                            unknown
                          </Chip>
                        ) : (
                          <>
                            <Chip color="default" size="sm" variant="soft">
                              {row.costSource}
                            </Chip>
                            {row.costObservedAt ? (
                              <p className="mt-1 text-[11px] text-muted">
                                observed {formatCalendarDay(row.costObservedAt)}
                              </p>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={paged.page}
              pageCount={paged.pageCount}
              total={paged.total}
              onChange={setPage}
            />
          </>
        )}

        <p className="max-w-3xl text-[11px] leading-5 text-muted">
          Credit-billed calls only. Free calls and included subscription usage
          are not in this table; their economics belong to the free-tier and
          subscription surfaces. Cost is the upstream cost recorded at
          settlement, so a provider price change applies to future calls, not to
          this history. Rows with an unknown cost basis are excluded from cost
          and contribution totals, which makes those totals a floor; coverage
          shows how much settled traffic is included.
        </p>
      </Card.Content>
    </Card>
  );
}
