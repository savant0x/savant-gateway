import { buildStatusBadge } from "@/lib/content/distribution";
import { contentEnabled } from "@/lib/content/policy";
import { listPublicSources } from "@/lib/content/store/sources";
import { getDatabase } from "@/lib/storage/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*" } as const;

/**
 * Shields.io endpoint payload for the public source status (FID-2026-1103-123).
 * It reads the same projection as `/signal/status`, never the admin row, so no
 * upstream error text or feed URL can reach a badge consumer.
 */
export async function GET() {
  if (!contentEnabled()) {
    return Response.json(
      {
        schemaVersion: 1,
        label: "signal",
        message: "disabled",
        color: "lightgrey",
      },
      { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
    );
  }

  try {
    const db = await getDatabase();
    const sources = await listPublicSources(db);

    return Response.json(buildStatusBadge(sources), {
      headers: {
        ...CORS,
        "Cache-Control":
          "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    return Response.json(
      {
        schemaVersion: 1,
        label: "signal",
        message: "unavailable",
        color: "lightgrey",
      },
      {
        status: 503,
        headers: { ...CORS, "Cache-Control": "no-store" },
      },
    );
  }
}
