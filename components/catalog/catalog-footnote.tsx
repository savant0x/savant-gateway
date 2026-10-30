import type { BenchmarkStatus } from "@/lib/types";

import { LocalTime } from "@/components/local-time";

export function CatalogFootnote({
  showComparison,
  showBenchmarks,
  benchmarkFetchedAt,
  benchmarkStatus,
}: {
  showComparison: boolean;
  showBenchmarks: boolean;
  benchmarkFetchedAt: string | null;
  benchmarkStatus: BenchmarkStatus | null;
}) {
  return (
    <div className="space-y-1 border-t border-black/10 px-4 py-3 text-[11px] text-muted dark:border-white/10">
      <p>
        <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
        Prices are USD per 1M tokens. One number means the same rate applies to
        input and output; two numbers are input then output. These are the sell
        rates the gateway enforces at request time, not our upstream cost. A row
        that reads “In plan” is sold with a subscription, and “Free pool” costs
        nothing while the shared allowance lasts.
      </p>
      <p>
        <i aria-hidden className="fa-solid fa-arrow-right-arrow-left mr-1.5" />
        {showComparison ? (
          <>
            Hover a Savant rate for the OpenRouter list rate it is compared
            against, matched by exact upstream id and fetched
            {benchmarkFetchedAt ? (
              <>
                {" "}
                <LocalTime value={benchmarkFetchedAt} />
              </>
            ) : (
              " from their public list"
            )}
            . The “vs OpenRouter” pill weighs three prompt tokens to one
            completion token, because the two directions are priced
            independently and we can be dearer on one while far cheaper on the
            other; hover it for both. A dash means no exact counterpart was
            listed.
          </>
        ) : (
          <>
            OpenRouter’s public list could not be fetched, so the comparison is
            hidden rather than showing every row as unlisted. The catalog and
            its own prices are unaffected.
          </>
        )}
      </p>
      {showBenchmarks ? (
        <p>
          <i aria-hidden className="fa-solid fa-gauge-high mr-1.5" />
          AA Benchmark is the{" "}
          <a
            className="underline decoration-dotted underline-offset-2 hover:text-accent"
            href="https://artificialanalysis.ai/"
            rel="noopener noreferrer"
            target="_blank"
          >
            Artificial Analysis
          </a>{" "}
          Intelligence Index
          {benchmarkStatus?.indexVersion
            ? `, index v${benchmarkStatus.indexVersion}`
            : ""}
          {benchmarkStatus?.syncedAt ? (
            <>
              , synced <LocalTime value={benchmarkStatus.syncedAt} />
            </>
          ) : null}
          . Hover a score for output speed and time to first token.{" "}
          {benchmarkStatus
            ? `${benchmarkStatus.matched} of ${benchmarkStatus.total} listed rows are measured; the rest show a dash, which means unmeasured rather than zero.`
            : "Rows without a score are unmeasured, not zero."}
        </p>
      ) : benchmarkStatus?.configured ? (
        <p>
          <i aria-hidden className="fa-solid fa-gauge-high mr-1.5" />
          The first benchmark sync has started. Scores appear on the next load;
          the column stays hidden until at least one row is measured.
        </p>
      ) : (
        <p>
          <i aria-hidden className="fa-solid fa-gauge-high mr-1.5" />
          Benchmark data is unavailable: no source key is configured on this
          server, so the quality column is hidden rather than showing every row
          as unmeasured.
        </p>
      )}
    </div>
  );
}
