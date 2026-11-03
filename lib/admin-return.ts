/**
 * Safe admin return paths (FID-2026-1103-128).
 *
 * The login page must be able to send an operator back to the console page
 * whose session ended, without becoming an open redirect. Only an absolute
 * path inside `/admin` is accepted. Protocol-relative URLs, external origins,
 * backslashes, control characters and the login page itself are rejected.
 */

export const ADMIN_LOGIN_PATH = "/admin/login";
const MAX_RETURN_LENGTH = 2_000;
const INTERNAL_ORIGIN = "https://admin-return.invalid";

export function safeAdminReturnTo(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  if (value.length > MAX_RETURN_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null;

  let url: URL;

  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== INTERNAL_ORIGIN) return null;

  const path = `${url.pathname}${url.search}`;

  if (path !== "/admin" && !path.startsWith("/admin/")) return null;

  if (
    url.pathname === ADMIN_LOGIN_PATH ||
    url.pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)
  ) {
    return null;
  }

  return path;
}

/**
 * Build the login destination. `returnTo` is re-validated here because callers
 * can be client components whose value came from the address bar.
 */
export function adminLoginHref(
  returnTo: string | null | undefined,
  notice: "session" | null = "session",
) {
  const safe = safeAdminReturnTo(returnTo);
  const params = new URLSearchParams();

  if (safe) params.set("returnTo", safe);
  if (safe && notice) params.set("notice", notice);

  const query = params.toString();

  return query ? `${ADMIN_LOGIN_PATH}?${query}` : ADMIN_LOGIN_PATH;
}
