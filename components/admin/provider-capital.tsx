import type { ProviderCapitalData } from "@/lib/provider-capital";

import { Card, Chip } from "@heroui/react";

import {
  formatMicros,
  formatMoney,
  formatNumber,
} from "@/components/dashboard/format";
import { LocalTime } from "@/components/local-time";

/**
 * Provider capital panel (FID-2026-1105-006).
 *
 * This is a read-only observation surface. It has no funding action, no
 * top-up control and no write path; the gateway cannot move money at an
 * upstream. A stale or absent balance is shown as such and produces no runway,
 * even if the provider status row still holds a number.
 */

function stateColor(
  state: ProviderCapitalData["rows"][number]["balanceState"],
) {
  if (state === "current") return "success" as const;
  if (state === "stale") return "warning" as const;

  return "default" as const;
}

export function ProviderCapitalPanel({ data }: { data: ProviderCapitalData }) {
  const { summary } = data;

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Card.Title>Provider capital and runway</Card.Title>
            <Card.Description>
              Freshly observed balances against recorded upstream cost for the
              trailing {data.windowDays} days. Runway is an estimate in USD at
              the current spend pace, not a forecast and not a funding limit.
            </Card.Description>
          </div>
          <Chip color="default" size="sm" variant="soft">
            {formatNumber(summary.providers)} providers
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] font-medium text-muted">
              Current observed balance
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatMoney(summary.knownBalanceUsd)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              {summary.currentBalances} current · {summary.staleBalances} stale
              · {summary.unavailableBalances} unavailable
            </dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] font-medium text-muted">
              Recorded upstream cost
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatMicros(summary.spendMicros)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              last {data.windowDays} days, by serving provider
            </dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] font-medium text-muted">
              Providers with a runway
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {data.rows.filter((row) => row.runwayDays !== null).length}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              requires a current balance and seven covered days
            </dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] font-medium text-muted">
              Dependent catalog rows
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">
              {formatNumber(summary.dependentModels)}
            </dd>
            <dd className="mt-1 text-[11px] text-muted">
              active, published models by provider
            </dd>
          </div>
        </dl>

        <div className="scroll-shell">
          <table className="data-table">
            <caption className="sr-only">
              Provider balances, recorded spend and estimated runway
            </caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th className="text-right" scope="col">
                  Balance
                </th>
                <th scope="col">Observed</th>
                <th scope="col">State</th>
                <th className="text-right" scope="col">
                  Recorded spend
                </th>
                <th className="text-right" scope="col">
                  Coverage
                </th>
                <th className="text-right" scope="col">
                  Estimated runway
                </th>
                <th className="text-right" scope="col">
                  Models
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.slug}>
                  <td className="max-w-[20rem]">
                    <p className="font-medium">
                      {row.label}{" "}
                      {!row.enabled ? (
                        <Chip color="default" size="sm" variant="soft">
                          disabled
                        </Chip>
                      ) : null}
                    </p>
                    <p className="mono truncate text-[11px] text-muted">
                      {row.slug}
                      {!row.configured ? " · key not configured" : ""}
                    </p>
                  </td>
                  <td className="text-right tabular-nums">
                    {row.balanceState === "current"
                      ? formatMoney(row.balanceUsd)
                      : "—"}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <LocalTime value={row.balanceObservedAt} />
                  </td>
                  <td>
                    <Chip
                      color={stateColor(row.balanceState)}
                      size="sm"
                      variant="soft"
                    >
                      {row.balanceState}
                    </Chip>
                  </td>
                  <td className="text-right tabular-nums">
                    {formatMicros(row.spendMicros)}
                  </td>
                  <td className="text-right tabular-nums">
                    {(row.coverageBps / 100).toFixed(0)}%
                    <p className="text-[11px] text-muted">
                      {row.coveredDays}/{row.windowDays} days
                    </p>
                  </td>
                  <td className="text-right tabular-nums">
                    {row.runwayDays === null ? (
                      <span
                        className="text-muted"
                        title={row.runwayReason ?? undefined}
                      >
                        —
                      </span>
                    ) : (
                      <>
                        {row.runwayDays.toFixed(1)} days
                        <p className="text-[11px] text-muted">
                          {formatMicros(row.dailySpendMicros)}/day
                        </p>
                      </>
                    )}
                  </td>
                  <td className="text-right tabular-nums">
                    {formatNumber(row.dependentModels)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="max-w-3xl text-[11px] leading-5 text-muted">
          Runway = current observed USD balance ÷ (recorded cost in the window ÷
          window days). It is reported only when the provider supports balance
          reporting, the observation is less than six hours old, at least seven
          days have recorded cost, and the balance is non-negative. It ignores
          committed spend, taxes, fees and future price changes, and it is not a
          credit limit or a funding instruction. A margin figure is shown as
          context, not as runway.
        </p>
        <p className="max-w-3xl text-[11px] leading-5 text-muted">
          Economic alerts are off by default. When the operator sets{" "}
          <code>OPERATIONS_ECONOMIC_ALERTS=1</code>, runway, margin-floor, stale
          cost and customer-spend conditions join the existing operations
          incidents and the configured alert webhook. No second alert pipeline
          exists.
        </p>
      </Card.Content>
    </Card>
  );
}
