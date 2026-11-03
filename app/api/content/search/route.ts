import { contentEnabled } from "@/lib/content/policy";
import { CONTENT_SEARCH_LIMITS, parseSearchQuery } from "@/lib/content/search";
import { searchClientKey, takeSearchToken } from "@/lib/content/search-limit";
import { listItems, listTags } from "@/lib/content/store/items";
import { searchModels } from "@/lib/content/store/search";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Read-only navigation search (FID-2026-1102-102). The query is validated
 * before storage is touched and every result group is capped. No admin field,
 * body text or unpublished row is selected.
 */
export async function GET(request: Request) {
  if (!contentEnabled()) {
    return Response.json(
      { error: "Signal is not enabled." },
      { status: 404, headers: NO_STORE },
    );
  }

  const limit = takeSearchToken(searchClientKey(request));

  if (!limit.allowed) {
    return Response.json(
      { error: `Too many searches. Retry in ${limit.retryAfterSeconds}s.` },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  }

  const parsed = parseSearchQuery(new URL(request.url).searchParams.get("q"));

  if (!parsed.ok) {
    return Response.json(
      { error: parsed.error },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const db = await getDatabase();
    const [page, models, topics] = await Promise.all([
      listItems(db, {
        search: parsed.query,
        limit: CONTENT_SEARCH_LIMITS.itemLimit,
      }),
      searchModels(db, parsed.query, CONTENT_SEARCH_LIMITS.modelLimit),
      listTags(db, CONTENT_SEARCH_LIMITS.topicLimit, parsed.query),
    ]);

    return Response.json(
      {
        items: page.items.map((item) => ({
          id: item.id,
          title: item.title,
          kind: item.kind,
          sourceLabel: item.sourceLabel,
        })),
        models,
        topics,
      },
      { headers: NO_STORE },
    );
  } catch {
    return Response.json(
      { error: "Search is unavailable." },
      { status: 500, headers: NO_STORE },
    );
  }
}
