import { getPublishedVisualThumbnail } from "@/lib/store";
import { visualBuildsEnabled } from "@/lib/visual-builds/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  if (!visualBuildsEnabled()) {
    return new Response("Not found.", { status: 404 });
  }

  const thumbnail = await getPublishedVisualThumbnail(
    (await context.params).id,
  );

  if (!thumbnail) {
    return new Response("Not found.", { status: 404 });
  }

  return new Response(new Blob([Uint8Array.from(thumbnail.bytes)]), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Content-Security-Policy": "default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      ETag: `"vb-thumb-${thumbnail.sha256.slice(0, 32)}"`,
    },
  });
}
