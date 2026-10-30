import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/admin-session";
import { normalizeEmail } from "@/lib/customer";
import {
  attachCustomerCookie,
  customerError,
  NO_STORE,
} from "@/lib/customer-auth";
import {
  clientKey,
  loginAccountLimiter,
  loginLimiter,
} from "@/lib/customer-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  createCustomerSession,
  findCustomerByEmail,
  markCustomerLogin,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let fallbackHash: string | null = null;

function dummyHash() {
  fallbackHash ??= hashPassword("timing-equalizer-not-a-real-password");

  return fallbackHash;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return customerError(403, "Cross-origin login rejected.");
  }

  const key = clientKey(request);
  const decision = loginLimiter.check(key);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many attempts. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let body: { email?: unknown; password?: unknown };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerError(400, "Invalid JSON body.");
  }

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    loginLimiter.fail(key);

    return customerError(401, "Invalid email or password.");
  }

  // A direct client can rotate `x-forwarded-for` and earn a fresh address
  // bucket. The account bucket is keyed by the email under attack, so the
  // guessing ceiling holds regardless of which headers the client sends.
  const accountDecision = loginAccountLimiter.check(email);

  if (!accountDecision.allowed) {
    return customerError(
      429,
      `Too many attempts. Retry in ${accountDecision.retryAfterSeconds}s.`,
      { "Retry-After": String(accountDecision.retryAfterSeconds) },
    );
  }

  const customer = findCustomerByEmail(email);
  const valid = verifyPassword(password, customer?.passwordHash ?? dummyHash());

  if (!customer || !valid) {
    loginLimiter.fail(key);
    loginAccountLimiter.fail(email);

    return customerError(401, "Invalid email or password.");
  }

  loginLimiter.reset(key);
  loginAccountLimiter.reset(email);
  markCustomerLogin(customer.id);

  const session = createCustomerSession(customer.id);
  const response = NextResponse.json(
    {
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        status: customer.status,
        createdAt: customer.createdAt,
      },
    },
    { headers: NO_STORE },
  );

  return attachCustomerCookie(response, session.token);
}
