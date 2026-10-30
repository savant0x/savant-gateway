export function CatalogFootnote({
  showComparison,
  benchmarkFetchedAt,
}: {
  showComparison: boolean;
  benchmarkFetchedAt: string | null;
}) {
  return (
    <div className="space-y-1 border-t border-black/10 px-4 py-3 text-[11px] text-muted dark:border-white/10">
      <p>
        <i aria-hidden className="fa-solid fa-circle-info mr-1.5" />
        Prices are USD per 1M tokens. One number means the same rate applies to
        input and output; two numbers are input then output. These are the sell
        rates the gateway enforces at request time, not our upstream cost. Plan
        rows show a dash because access is sold with a plan, and free rows cost
        nothing while the shared allowance lasts.
      </p>
      <p>
        <i aria-hidden className="fa-solid fa-arrow-right-arrow-left mr-1.5" />
        {showComparison ? (
          <>
            The “vs list” pill weighs three prompt tokens to one completion
            token, because the two directions are priced independently and we
            can be dearer on one while far cheaper on the other. Hover it for
            both. Compared against OpenRouter’s public model list
            {benchmarkFetchedAt
              ? ` fetched ${new Date(benchmarkFetchedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`
              : ""}
            , matched by exact upstream id. A dash means no exact counterpart
            was listed.
          </>
        ) : (
          <>
            OpenRouter’s public list could not be fetched, so the comparison
            columns are hidden rather than showing every row as unlisted. The
            catalog and its own prices are unaffected.
          </>
        )}
      </p>
    </div>
  );
}
