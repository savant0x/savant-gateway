import { NextResponse } from "next/server";

import {
  normalizeEmail,
  normalizeName,
  validateEmail,
  validateName,
  validateNewPassword,
} from "@/lib/customer";
import {
  attachCustomerCookie,
  customerError,
  NO_STORE,
} from "@/lib/customer-auth";
import { clientKey, signupLimiter } from "@/lib/customer-rate-limit";
import { isSameOriginRequest } from "@/lib/admin-session";
import { POLICY_VERSION } from "@/lib/legal";
import { hashPassword } from "@/lib/password";
import {
  createCustomer,
  createCustomerSession,
  findCustomerByEmail,
  recordPolicyAcceptance,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function duplicateEmail(error: unknown) {
  const code = (error as { code?: string } | null)?.code;

  return typeof code === "string" && code.startsWith("SQLITE_CONSTRAINT");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return customerError(403, "Cross-origin signup rejected.");
  }

  const key = clientKey(request);
  const decision = signupLimiter.check(key);

  if (!decision.allowed) {
    return customerError(
      429,
      `Too many signups from this client. Retry in ${decision.retryAfterSeconds}s.`,
      { "Retry-After": String(decision.retryAfterSeconds) },
    );
  }

  let body: {
    email?: unknown;
    name?: unknown;
    password?: unknown;
    acceptedPolicies?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return customerError(400, "Invalid JSON body.");
  }

  // The policies are accepted at the point the account is created; an account
  // is never created without a recorded acceptance of the current version.
  if (body.acceptedPolicies !== true) {
    return customerError(
      400,
      "Accept the terms of service and the privacy notice to create an account.",
    );
  }

  const email = normalizeEmail(body.email);
  const name = normalizeName(body.name);
  const password = typeof body.password === "string" ? body.password : "";

  const problem =
    validateName(name) || validateEmail(email) || validateNewPassword(password);

  if (problem) return customerError(400, problem);

  // Reject a known email before paying for scrypt or hitting the unique
  // constraint. The insert catch still covers the concurrent-signup race.
  if (findCustomerByEmail(email)) {
    return customerError(409, "An account with this email already exists.");
  }

  const passwordHash = hashPassword(password);

  try {
    const customer = createCustomer({ email, name, passwordHash });

    recordPolicyAcceptance({
      userId: customer.id,
      version: POLICY_VERSION,
      source: "signup",
    });

    signupLimiter.fail(key);

    const session = createCustomerSession(customer.id);
    const response = NextResponse.json(
      { customer },
      { status: 201, headers: NO_STORE },
    );

    return attachCustomerCookie(response, session.token);
  } catch (error) {
    if (duplicateEmail(error)) {
      return customerError(409, "An account with this email already exists.");
    }

    return customerError(500, "Could not create the account.");
  }
}
