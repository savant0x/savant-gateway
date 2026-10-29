import "server-only";

import type { NextResponse } from "next/server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isSameOriginRequest } from "./admin-session";
import { CUSTOMER_COOKIE, sessionCookieOptions } from "./customer-session";
import { resolveCustomerSession } from "./store/customer";

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function customerError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
) {
  return Response.json(
    { error: message },
    { status, headers: { ...NO_STORE, ...headers } },
  );
}

export async function getCustomerSession() {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;

  return resolveCustomerSession(token);
}

export async function requireCustomerPage() {
  const customer = await getCustomerSession();

  if (!customer) redirect("/login");

  return customer;
}

/**
 * Returns the signed-in customer, or the error response to send. Mutations
 * require a same-origin request; the session cookie is HttpOnly + SameSite.
 */
export async function requireCustomerApi(request: Request) {
  if (!isSameOriginRequest(request)) {
    return customerError(403, "Cross-origin request rejected.");
  }

  const customer = await getCustomerSession();

  if (!customer) return customerError(401, "Sign in to continue.");

  return customer;
}

export function attachCustomerCookie(response: NextResponse, token: string) {
  response.cookies.set(
    CUSTOMER_COOKIE,
    token,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );

  return response;
}

export function clearCustomerCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
