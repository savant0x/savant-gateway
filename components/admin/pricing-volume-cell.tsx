import {
  formatNumber,
  formatSignedMicros,
} from "@/components/dashboard/format";

/**
 * The historical-volume projection cell (FID-2026-1105-005).
 *
 * Extracted from the recommendation table for the 400-line ceiling. The
 * distinction between "no traffic", "cost unknown" and a real projection is the
 * point of the cell: a missing input never renders as a zero contribution.
 */
export function PricingVolumeCell({
  projected,
  requests,
  hadVolume,
}: {
  projected: { contributionMicros: number } | null;
  requests: number;
  hadVolume: boolean;
}) {
  return (
    <td className="whitespace-nowrap text-right align-middle tabular-nums">
      {projected ? (
        <>
          <span
            className={projected.contributionMicros < 0 ? "text-danger" : ""}
          >
            {formatSignedMicros(projected.contributionMicros)}
          </span>
          <p className="text-[11px] text-muted">
            {formatNumber(requests)} calls
          </p>
        </>
      ) : hadVolume ? (
        <span className="text-muted">cost unknown</span>
      ) : (
        <span className="text-muted">no traffic</span>
      )}
    </td>
  );
}
