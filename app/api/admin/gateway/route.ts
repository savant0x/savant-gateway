import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { CONTEXT_BANNER_MAX_CHARS } from "@/lib/context-banner";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { getBannerConfig, saveBannerConfig } from "@/lib/store-facade/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(
    {
      banner: await getBannerConfig(),
      bannerMaxChars: CONTEXT_BANNER_MAX_CHARS,
    },
    { headers: NO_STORE },
  );
}

export async function PATCH(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: JsonRecord;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const banner = body.banner === undefined ? null : record(body.banner);

  if (!banner) {
    return adminError(400, "banner must be an object.");
  }

  if (banner.enabled !== undefined && typeof banner.enabled !== "boolean") {
    return adminError(400, "banner.enabled must be a boolean.");
  }

  if (banner.text !== undefined && typeof banner.text !== "string") {
    return adminError(400, "banner.text must be a string.");
  }

  const saved = await saveBannerConfig({
    enabled: banner.enabled === undefined ? undefined : banner.enabled,
    text: banner.text === undefined ? undefined : banner.text,
  });

  if (!saved.ok) return adminError(400, saved.error);

  return Response.json(
    {
      banner: await getBannerConfig(),
      bannerMaxChars: CONTEXT_BANNER_MAX_CHARS,
    },
    { headers: NO_STORE },
  );
}
