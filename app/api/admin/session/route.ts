import { NextResponse } from "next/server";

import {
  adminError,
  attachSessionCookie,
  clearSessionCookie,
  NO_STORE,
} from "@/lib/admin-auth";
import { createRateLimiter } from "@/lib/admin-rate-limit";
import {
  createSessionToken,
  isSameOriginRequest,
  readAdminConfig,
  verifyAdminPassword,
} from "@/lib/admin-session";
import { bumpAdminSessionEpoch, getAdminSessionEpoch } from "@/lib/store/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter();

function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();

  return first || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  const config = readAdminConfig();

  if (!config.configured) {
    return adminError(503, config.reason);
  }

  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin login rejected.");
  }

  const key = clientKey(request);
  const decision = limiter.check(key);

  if (!decision.allowed) {
    return adminError(
      429,
      `Too many attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let password: unknown;

  try {
    const body = (await request.json()) as { password?: unknown };

    password = body.password;
  } catch {
    return adminError(400, "Invalid JSON body.");
  }

  if (!verifyAdminPassword(password, config.password)) {
    limiter.fail(key);

    return adminError(401, "Invalid admin password.");
  }

  limiter.reset(key);

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE });

  return attachSessionCookie(
    response,
    createSessionToken(config, getAdminSessionEpoch()),
  );
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin logout rejected.");
  }

  bumpAdminSessionEpoch();

  return clearSessionCookie(
    NextResponse.json({ ok: true }, { headers: NO_STORE }),
  );
}
