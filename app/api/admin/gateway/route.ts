import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { CONTEXT_BANNER_MAX_CHARS } from "@/lib/context-banner";
import {
  getAllocationSummary,
  saveAllocationConfig,
} from "@/lib/store/allocations";
import { getBannerConfig, saveBannerConfig } from "@/lib/store/banner";
import { utcDay } from "@/lib/store/free-pool";
import { refreshProviderRuntime } from "@/lib/providers/runtime";

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

  await refreshProviderRuntime("savant");

  return Response.json(
    {
      allocation: getAllocationSummary(utcDay()),
      banner: getBannerConfig(),
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
    body = record(await request.json()) ?? {};
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  const banner = body.banner === undefined ? null : record(body.banner);
  const allocation =
    body.allocation === undefined ? null : record(body.allocation);

  if (body.banner !== undefined && !banner) {
    return adminError(400, "banner must be an object.");
  }

  if (body.allocation !== undefined && !allocation) {
    return adminError(400, "allocation must be an object.");
  }

  if (!banner && !allocation) {
    return adminError(400, "Provide a banner or allocation update.");
  }

  if (banner) {
    if (banner.enabled !== undefined && typeof banner.enabled !== "boolean") {
      return adminError(400, "banner.enabled must be a boolean.");
    }

    if (banner.text !== undefined && typeof banner.text !== "string") {
      return adminError(400, "banner.text must be a string.");
    }

    const saved = saveBannerConfig({
      enabled: banner.enabled === undefined ? undefined : banner.enabled,
      text: banner.text === undefined ? undefined : banner.text,
    });

    if (!saved.ok) return adminError(400, saved.error);
  }

  if (allocation) {
    if (
      allocation.enabled !== undefined &&
      typeof allocation.enabled !== "boolean"
    ) {
      return adminError(400, "allocation.enabled must be a boolean.");
    }

    if (
      allocation.dailyPoolTokens !== undefined &&
      (typeof allocation.dailyPoolTokens !== "number" ||
        !Number.isSafeInteger(allocation.dailyPoolTokens) ||
        allocation.dailyPoolTokens < 0)
    ) {
      return adminError(
        400,
        "allocation.dailyPoolTokens must be a non-negative integer.",
      );
    }

    if (
      allocation.allocationBps !== undefined &&
      (typeof allocation.allocationBps !== "number" ||
        !Number.isInteger(allocation.allocationBps) ||
        allocation.allocationBps < 0 ||
        allocation.allocationBps > 10_000)
    ) {
      return adminError(
        400,
        "allocation.allocationBps must be an integer between 0 and 10000.",
      );
    }

    if (
      allocation.accountDailyCapTokens !== undefined &&
      (typeof allocation.accountDailyCapTokens !== "number" ||
        !Number.isSafeInteger(allocation.accountDailyCapTokens) ||
        allocation.accountDailyCapTokens < 0)
    ) {
      return adminError(
        400,
        "allocation.accountDailyCapTokens must be a non-negative integer; 0 disables the cap.",
      );
    }

    saveAllocationConfig({
      enabled:
        allocation.enabled === undefined ? undefined : allocation.enabled,
      dailyPoolTokens:
        allocation.dailyPoolTokens === undefined
          ? undefined
          : allocation.dailyPoolTokens,
      allocationBps:
        allocation.allocationBps === undefined
          ? undefined
          : allocation.allocationBps,
      accountDailyCapTokens:
        allocation.accountDailyCapTokens === undefined
          ? undefined
          : allocation.accountDailyCapTokens,
    });
  }

  return Response.json(
    {
      allocation: getAllocationSummary(utcDay()),
      banner: getBannerConfig(),
      bannerMaxChars: CONTEXT_BANNER_MAX_CHARS,
    },
    { headers: NO_STORE },
  );
}
