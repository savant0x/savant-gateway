import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/admin-session";
import {
  clearCustomerCookie,
  customerError,
  NO_STORE,
} from "@/lib/customer-auth";
import { CUSTOMER_COOKIE } from "@/lib/customer-session";
import { revokeCustomerSession } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return customerError(403, "Cross-origin logout rejected.");
  }

  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;

  revokeCustomerSession(token);

  return clearCustomerCookie(
    NextResponse.json({ ok: true }, { headers: NO_STORE }),
  );
}
