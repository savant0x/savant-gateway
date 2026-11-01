import { consumeAccountAction } from "@/lib/storage/ledger/account-actions";
import { createRateLimiter } from "@/lib/admin-rate-limit";
import { isSameOriginRequest } from "@/lib/admin-session";
import { validateNewPassword } from "@/lib/customer";
import { customerError, NO_STORE } from "@/lib/customer-auth";
import { clientKey } from "@/lib/customer-rate-limit";
import { isSessionToken } from "@/lib/customer-session";
import { hashPassword } from "@/lib/password";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { storeRuntime } from "@/lib/store-facade/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = createRateLimiter({ limit: 10, windowMs: 600_000 });

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return customerError(403, "Cross-origin request rejected.");

  const key = clientKey(request);
  const decision = limiter.check(key);

  if (!decision.allowed) {
    return customerError(429, "Too many attempts. Retry later.", {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }

  limiter.fail(key);
  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (
    !isSessionToken(body.token) ||
    (body.purpose !== "verify" && body.purpose !== "reset")
  ) {
    return customerError(400, "Invalid or expired account link.");
  }

  const password = typeof body.password === "string" ? body.password : "";

  if (body.purpose === "reset") {
    const problem = validateNewPassword(password);

    if (problem) return customerError(400, problem);
  }

  const db = await storeRuntime();
  const consumed = await consumeAccountAction(db, {
    token: body.token,
    purpose: body.purpose,
    ...(body.purpose === "reset"
      ? { passwordHash: hashPassword(password) }
      : {}),
    now: Date.now(),
  });

  if (!consumed) return customerError(400, "Invalid or expired account link.");

  return Response.json({ ok: true }, { headers: NO_STORE });
}
