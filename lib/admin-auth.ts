import "server-only";

import type { NextResponse } from "next/server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  ADMIN_COOKIE,
  isSameOriginRequest,
  readAdminConfig,
  sessionCookieOptions,
  verifySessionToken,
} from "./admin-session";
import { isLocalRequest } from "./http";
import { getAdminSessionEpoch } from "./store/admin";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

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

  return verifySessionToken(token, config, getAdminSessionEpoch());
}

export async function requireAdminPage() {
  if (!(await getAdminSession())) redirect("/admin/login");
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

  if (isLocalRequest(request)) return null;
  if (await getAdminSession()) return null;

  return adminError(
    403,
    "This development endpoint requires localhost or an admin session.",
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
