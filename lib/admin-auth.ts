import "server-only";

import type { NextResponse } from "next/server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { adminLoginHref } from "./admin-return";
import {
  ADMIN_COOKIE,
  isSameOriginRequest,
  readAdminConfig,
  sessionCookieOptions,
  verifySessionToken,
} from "./admin-session";
import { isLocalRequest } from "./http";
import { getDatabase } from "./storage/runtime";
import { getAdminSessionEpoch } from "./storage/store/admin";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

// Local development may use the operator console without a session. A
// production server must not trust a spoofable Host header for privileged
// actions, so the bypass is compiled out in production.
const ALLOW_LOOPBACK_CONSOLE = process.env.NODE_ENV !== "production";

export function adminError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error: message },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

export async function getAdminSession(): Promise<boolean> {
  const config = readAdminConfig();

  if (!config.configured) return false;

  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;

  // The login route signs the epoch from the Postgres store. Reading the
  // SQLite epoch here made every issued cookie fail once the two dev databases
  // disagreed. One session, one epoch source.
  try {
    const epoch = await getAdminSessionEpoch(await getDatabase());

    return verifySessionToken(token, config, epoch);
  } catch {
    return false;
  }
}

export async function requireAdminPage() {
  if (await getAdminSession()) return;

  const current = (await headers()).get("x-admin-path");

  redirect(adminLoginHref(current, "session"));
}

export async function guardAdminApi(request: Request) {
  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin admin request rejected.");
  }

  if (!(await getAdminSession())) {
    return adminError(401, "Admin sign-in required.");
  }

  return null;
}

export async function guardLocalOrAdmin(request: Request) {
  if (!isSameOriginRequest(request)) {
    return adminError(403, "Cross-origin request rejected.");
  }

  if (ALLOW_LOOPBACK_CONSOLE && isLocalRequest(request)) return null;
  if (await getAdminSession()) return null;

  return adminError(
    403,
    "This operator endpoint requires an admin session in production.",
  );
}

export function attachSessionCookie(
  response: NextResponse,
  token: string,
): NextResponse {
  response.cookies.set(
    ADMIN_COOKIE,
    token,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  return response;
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
