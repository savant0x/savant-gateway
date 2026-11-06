import { getPublishedVisualBundle } from "@/lib/store";
import { visualBuildsEnabled } from "@/lib/visual-builds/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Public, sandboxed bundle envelope. `no-store` is deliberate: withdrawing a
 * rights decision must remove the HTML on the next request, not after a CDN TTL.
 */
export async function GET(_request: Request, context: Context) {
  if (!visualBuildsEnabled()) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const build = await getPublishedVisualBundle((await context.params).id);

  if (!build) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  return Response.json(
    {
      buildId: build.build.buildId,
      revisionId: build.build.revisionId,
      modelId: build.build.modelId,
      sha256: build.sha256,
      html: build.html,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
