import { NextResponse } from "next/server";

import {
  adminError,
  attachSessionCookie,
  clearSessionCookie,
  NO_STORE,
} from "@/lib/admin-auth";
import { createRateLimiter } from "@/lib/admin-rate-limit";
import { clientKey } from "@/lib/customer-rate-limit";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  createSessionToken,
  isSameOriginRequest,
  readAdminConfig,
  verifyAdminPassword,
} from "@/lib/admin-session";
import {
  bumpAdminSessionEpoch,
  getAdminSessionEpoch,
} from "@/lib/store-facade/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter();

export async function POST(request: Request) {
  const config = readAdminConfig();

  if (!config.configured) {
    return adminError(503, config.reason, {}, "admin_not_configured");
  }

  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin login rejected.", {}, "cross_origin");
  }

  const key = clientKey(request);
  const decision = limiter.check(key);

  if (!decision.allowed) {
    return adminError(
      429,
      `Too many attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
      "rate_limited",
    );
  }

  let password: unknown;

  try {
    const body = await readJsonObject(request);

    password = body.password;
  } catch (error) {
    return requestBodyError(error);
  }

  if (!verifyAdminPassword(password, config.password)) {
    limiter.fail(key);

    return adminError(401, "Invalid admin password.", {}, "invalid_password");
  }

  limiter.reset(key);

  try {
    const epoch = await getAdminSessionEpoch();
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });

    return attachSessionCookie(response, createSessionToken(config, epoch));
  } catch {
    return adminError(
      503,
      "The gateway database is unavailable, so an admin session cannot be issued. Check DATABASE_URL and /api/ready.",
      {},
      "database_unavailable",
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin logout rejected.", {}, "cross_origin");
  }

  try {
    await bumpAdminSessionEpoch();
  } catch {
    return adminError(
      503,
      "The gateway database is unavailable, so the admin session could not be ended. Retry when /api/ready is healthy.",
      {},
      "database_unavailable",
    );
  }

  return clearSessionCookie(
    NextResponse.json({ ok: true }, { headers: NO_STORE }),
  );
}
