import { siteOrigin } from "@/config/site";
import { buildDigestFeed, parseFeedDays } from "@/lib/content/distribution";
import { digestWindow, recentDigestDays } from "@/lib/content/digest";
import { contentEnabled } from "@/lib/content/policy";
import { listItems } from "@/lib/content/store/items";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * RSS is a read-only projection of the same digest window the HTML page uses
 * (FID-2026-1103-123). The query parameter is bounded before storage is read,
 * and the body is built by a pure function so no route-only formatting leaks
 * into the feed.
 */
export async function GET(request: Request) {
  if (!contentEnabled()) {
    return new Response("Signal is not enabled.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const days = parseFeedDays(new URL(request.url).searchParams.get("days"));
  const window = digestWindow(recentDigestDays(days)[0]);
  const oldest = digestWindow(recentDigestDays(days)[days - 1]);

  if (!window || !oldest) {
    return new Response("Invalid digest window.", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const db = await getDatabase();
    const page = await listItems(db, {
      since: oldest.since,
      until: window.until,
      limit: 48,
    });

    return new Response(
      buildDigestFeed({ items: page.items, origin: siteOrigin, days }),
      {
        headers: {
          "Content-Type": "application/rss+xml; charset=utf-8",
          "Cache-Control":
            "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?>\n<error>The digest feed is temporarily unavailable.</error>',
      {
        status: 503,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
