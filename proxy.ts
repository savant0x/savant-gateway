import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";

/**
 * The admin layout is shared by every console page and cannot read the current
 * request path directly. This proxy copies only the path and query into an
 * internal request header so the unauthenticated redirect can preserve the
 * operator's destination. Authorization still happens in the layout.
 */
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(
    "x-admin-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
