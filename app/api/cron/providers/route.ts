import { timingSafeEqual } from "node:crypto";

import { sanitizeError } from "@/lib/http";
import {
  providerCronSecrets,
  syncIntervalMs,
} from "@/lib/provider-sync-policy";
import { syncProvider } from "@/lib/providers/sync";
import { refreshProvidersIfDue } from "@/lib/storage/providers/freshness";
import { getDatabase } from "@/lib/storage/runtime";
import { listProviderCatalogSummary } from "@/lib/storage/store/provider-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function suppliedSecret(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  return (
    bearer ??
    request.headers.get("x-provider-secret")?.trim() ??
    request.headers.get("x-cron-secret")?.trim() ??
    ""
  );
}

function matches(supplied: string, expected: string): boolean {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);

  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}

/**
 * One heartbeat contract for GET and POST. Authentication precedes every
 * database and upstream read. The scheduler is external: Vercel Hobby calls
 * this route daily, and any other scheduler may call it with a configured
 * secret. `force` bypasses only the render path's five-minute attempt floor;
 * the due interval and the durable per-provider lease still apply.
 */
async function heartbeat(request: Request) {
  const expected = providerCronSecrets();

  if (expected.length === 0) {
    return Response.json(
      {
        error:
          "No provider cron secret is configured. Set PROVIDER_CRON_SECRET or CRON_SECRET.",
      },
      { status: 503, headers: NO_STORE },
    );
  }

  const supplied = suppliedSecret(request);

  if (!expected.some((secret) => matches(supplied, secret))) {
    return Response.json(
      { error: "Invalid cron secret." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const db = await getDatabase();
    const attempted = await refreshProvidersIfDue(db, {
      sync: (slug) => syncProvider(slug),
      force: true,
    });
    const providers = (await listProviderCatalogSummary(db)).map(
      (provider) => ({
        slug: provider.slug,
        label: provider.label,
        enabled: provider.enabled,
        configured: provider.configured,
        syncedAt: provider.syncedAt,
        modelCount: provider.modelCount,
        servingCount: provider.servingCount,
      }),
    );

    return Response.json(
      {
        ok: true,
        attempted,
        intervalHours: Math.round(
          syncIntervalMs(process.env.PROVIDER_SYNC_INTERVAL_HOURS) / 3_600_000,
        ),
        providers,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    return Response.json(
      {
        error: sanitizeError(
          "cron.providers",
          error,
          "Provider scheduler failed.",
        ),
      },
      { status: 503, headers: NO_STORE },
    );
  }
}

export async function GET(request: Request) {
  return heartbeat(request);
}

export async function POST(request: Request) {
  return heartbeat(request);
}
