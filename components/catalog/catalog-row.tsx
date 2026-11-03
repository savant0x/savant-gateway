import type { BenchmarkSummary, ModelAccess } from "@/lib/types";
import type { PairedCatalogModel } from "@/lib/catalog-pairs";
import type { PriceComparison } from "@/lib/price-comparison";

import Link from "next/link";

import {
  QualityCell,
  deltaClass,
  formatDelta,
  priceProvenance,
  RateCell,
} from "./catalog-cells";

import { AccessChip } from "@/components/dashboard/chips";
import { catalogAccessPaths } from "@/lib/catalog-pairs";
import { formatPricePer1M } from "@/components/dashboard/format";

const PATH_ICON: Record<ModelAccess, string> = {
  free: "fa-gift",
  paid: "fa-bolt",
  subscription: "fa-key",
};

function modelHref(id: string) {
  return `/models/${id.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * One table row for one model. A model sold twice — a free allocation and the
 * metered id — lists both access chips and both purchase paths, because the
 * customer is choosing a way to pay, not a different model.
 */
export function CatalogRow({
  row,
  benchmark,
  comparison,
  showBenchmarks,
  showComparison,
}: {
  row: PairedCatalogModel;
  benchmark?: BenchmarkSummary;
  comparison?: PriceComparison;
  showBenchmarks: boolean;
  showComparison: boolean;
}) {
  const model = row.primary;
  const weight = row.free?.tokenWeight ?? model.tokenWeight;
  const supportsTools = row.variants.some((variant) => variant.supportsTools);
  const supportsVision = row.variants.some((variant) => variant.supportsVision);
  const paths = catalogAccessPaths(row);

  return (
    <tr>
      <td className="catalog-model">
        <Link
          className="block truncate font-medium underline-offset-4 hover:underline"
          href={modelHref(model.id)}
        >
          {row.display.name}
        </Link>
        <div
          className="catalog-sub mono"
          title={row.variants.map((v) => v.id).join(" · ")}
        >
          {row.display.family} · {row.display.contextWindow}
          {row.variants.map((variant) => (
            <span key={variant.id}>
              {" · "}
              <Link
                className="hover:text-accent hover:underline"
                href={modelHref(variant.id)}
              >
                {variant.id}
              </Link>
            </span>
          ))}
        </div>
      </td>
      <td className="whitespace-nowrap">
        <span className="inline-flex flex-wrap items-center gap-1">
          {row.variants.map((variant) => (
            <AccessChip key={variant.id} model={variant} />
          ))}
        </span>
      </td>
      <td className="catalog-rate text-right">
        {weight > 0 ? (
          <span title="Free-pool token weight">{weight}×</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="catalog-col-features whitespace-nowrap text-center">
        {supportsTools || supportsVision ? (
          <span className="inline-flex items-center gap-2">
            {supportsTools ? (
              <i
                aria-hidden
                className="fa-solid fa-wrench text-[10px] text-muted"
                title="Supports tools"
              />
            ) : null}
            {supportsVision ? (
              <i
                aria-hidden
                className="fa-solid fa-eye text-[10px] text-muted"
                title="Supports vision"
              />
            ) : null}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      {showBenchmarks ? (
        <td className="catalog-rate text-right">
          <QualityCell benchmark={benchmark} />
        </td>
      ) : null}
      <td className="catalog-rate text-right">
        <span
          className="cursor-help"
          title={priceProvenance(
            { input: model.inputPricePer1M, output: model.outputPricePer1M },
            model.access,
            comparison,
          )}
        >
          <RateCell
            access={model.access}
            input={model.inputPricePer1M}
            output={model.outputPricePer1M}
          />
        </span>
        {row.free && row.paid ? (
          <span className="block text-[10px] text-muted">
            or free tier, {row.free.tokenWeight}× weighted
          </span>
        ) : null}
      </td>
      {showComparison ? (
        <td className="catalog-rate text-right">
          {model.access === "paid" && comparison?.blendedDeltaBps != null ? (
            <span
              className={`inline-flex items-center rounded-[0.2rem] border border-border bg-surface-secondary px-2 py-0.5 text-[11px] ${deltaClass(
                comparison.blendedDeltaBps,
              )}`}
              title={`3 input : 1 output blend vs ${comparison.openRouterId}. Prompt tokens ${formatDelta(
                comparison.inputDeltaBps,
              )}, completion tokens ${formatDelta(comparison.outputDeltaBps)}.`}
            >
              {formatDelta(comparison.blendedDeltaBps)}
            </span>
          ) : comparison?.blendedDeltaBps != null ? (
            // Included models are 100 % cheaper than the public list by
            // definition. Muted text, not a badge: eleven identical green
            // badges would shout.
            <span
              className="text-muted"
              title={`Included in ${model.access === "free" ? "the free pool" : "a plan"}; ${comparison.openRouterId} lists ${formatPricePer1M(
                comparison.inputPer1M,
              )} in / ${formatPricePer1M(comparison.outputPer1M)} out per 1M.`}
            >
              {formatDelta(comparison.blendedDeltaBps)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      ) : null}
      <td className="whitespace-nowrap text-right">
        <span className="inline-flex flex-col items-end gap-1">
          {paths.map((path) => (
            <Link
              key={path.access}
              className="text-[11px] text-accent underline-offset-4 hover:underline"
              href={path.href}
              title={path.detail}
            >
              <i
                aria-hidden
                className={`fa-solid ${PATH_ICON[path.access]} mr-1`}
              />
              {path.label}
            </Link>
          ))}
        </span>
      </td>
    </tr>
  );
}
