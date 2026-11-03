import type { BenchmarkSummary, ModelAccess } from "@/lib/types";
import type { CatalogSkuRow } from "@/lib/catalog-skus";
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
import { catalogAccessPath } from "@/lib/catalog-skus";
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
 * One table row for one SKU. The free allocation, the metered id and a
 * subscription row are separate products, so each row carries exactly one
 * access chip, one price and one detail link. Pairing them would hide the free
 * detail page behind the paid variant.
 */
export function CatalogRow({
  row,
  benchmark,
  comparison,
  showBenchmarks,
  showComparison,
}: {
  row: CatalogSkuRow;
  benchmark?: BenchmarkSummary;
  comparison?: PriceComparison;
  showBenchmarks: boolean;
  showComparison: boolean;
}) {
  const model = row.model;
  const path = catalogAccessPath(model);

  return (
    <tr>
      <td className="catalog-model">
        <Link
          className="block truncate font-medium underline-offset-4 hover:underline"
          href={modelHref(model.id)}
        >
          {row.name}
        </Link>
        <div className="catalog-sub mono" title={model.id}>
          {model.family} · {model.contextWindow} ·{" "}
          <Link
            className="hover:text-accent hover:underline"
            href={modelHref(model.id)}
          >
            {model.id}
          </Link>
        </div>
      </td>
      <td className="whitespace-nowrap">
        <AccessChip model={model} />
      </td>
      <td className="catalog-rate text-right">
        {model.tokenWeight > 0 ? (
          <span title="Free-pool token weight">{model.tokenWeight}×</span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="catalog-col-features whitespace-nowrap text-center">
        {model.supportsTools || model.supportsVision ? (
          <span className="inline-flex items-center gap-2">
            {model.supportsTools ? (
              <i
                aria-hidden
                className="fa-solid fa-wrench text-[10px] text-muted"
                title="Supports tools"
              />
            ) : null}
            {model.supportsVision ? (
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
            // A free or plan row is 100% cheaper than the public list by
            // definition. Muted text, not a badge: every included SKU would
            // otherwise shout the same green number.
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
        <Link
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
      </td>
    </tr>
  );
}
