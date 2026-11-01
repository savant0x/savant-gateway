import { after } from "next/server";

import { isSameOriginRequest } from "@/lib/admin-session";
import {
  issueAccountAction,
  recordActionDelivery,
} from "@/lib/storage/ledger/account-actions";
import { readAccountEmailConfig, sendAccountEmail } from "@/lib/account-email";
import { createRateLimiter } from "@/lib/admin-rate-limit";
import { normalizeEmail, validateEmail } from "@/lib/customer";
import {
  customerError,
  getCustomerSession,
  NO_STORE,
} from "@/lib/customer-auth";
import { clientKey } from "@/lib/customer-rate-limit";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { findCustomerByEmail } from "@/lib/store-facade/access";
import { storeRuntime } from "@/lib/store-facade/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clientLimiter = createRateLimiter({ limit: 10, windowMs: 3_600_000 });
const addressLimiter = createRateLimiter({ limit: 3, windowMs: 3_600_000 });
const GENERIC =
  "If an eligible account exists, a message was requested. If it does not arrive, retry later.";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request))
    return customerError(403, "Cross-origin request rejected.");

  const config = readAccountEmailConfig();

  if (!config)
    return customerError(503, "Account email delivery is not configured.");

  const key = clientKey(request);
  const decision = clientLimiter.check(key);

  if (!decision.allowed) {
    return customerError(429, "Too many email requests. Retry later.", {
      "Retry-After": String(decision.retryAfterSeconds),
    });
  }

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  if (body.purpose !== "verify" && body.purpose !== "reset") {
    return customerError(400, "purpose must be verify or reset.");
  }

  const purpose = body.purpose;
  const customer = purpose === "verify" ? await getCustomerSession() : null;

  if (purpose === "verify" && !customer)
    return customerError(401, "Sign in to verify your email.");

  const email = customer?.email ?? normalizeEmail(body.email);

  if (validateEmail(email))
    return customerError(400, "Enter a valid email address.");

  clientLimiter.fail(key);
  const addressKey = `${purpose}:${email}`;
  const allowed = addressLimiter.check(addressKey).allowed;

  addressLimiter.fail(addressKey);
  const db = await storeRuntime();
  const account = customer ?? (await findCustomerByEmail(email));
  const action =
    allowed && account
      ? await issueAccountAction(db, {
          userId: account.id,
          email,
          purpose,
          now: Date.now(),
        })
      : null;

  if (action) {
    const deliver = async () => {
      const sent = await sendAccountEmail({
        config,
        actionId: action.id,
        recipient: email,
        purpose,
        token: action.token,
      });

      await recordActionDelivery(db, action.id, sent);

      return sent;
    };

    if (purpose === "reset") {
      // Delivery latency must not reveal whether a recovery account exists.
      // A crash leaves an unusable pending token; requesting again replaces it.
      after(async () => {
        try {
          await deliver();
        } catch {
          // eslint-disable-next-line no-console
          console.error(
            "[account.email] Delivery state could not be recorded.",
          );
        }
      });
    } else if (!(await deliver())) {
      return customerError(
        503,
        "The verification email could not be sent. Retry later.",
      );
    }
  }

  return Response.json({ message: GENERIC }, { headers: NO_STORE });
}
