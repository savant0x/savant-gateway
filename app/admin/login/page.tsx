import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/admin/login-screen";
import { readAdminDiagnostics } from "@/lib/admin-diagnostics";
import { getAdminSession } from "@/lib/admin-auth";
import { safeAdminReturnTo } from "@/lib/admin-return";
import { readAdminConfig } from "@/lib/admin-session";
import { getAdminSessionEpoch } from "@/lib/store-facade/operations";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string | string[];
    notice?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const requestedReturnTo =
    typeof params.returnTo === "string" ? params.returnTo : null;
  const returnTo = safeAdminReturnTo(requestedReturnTo);

  if (await getAdminSession()) redirect(returnTo ?? "/admin");

  const config = readAdminConfig();
  // The login POST cannot issue a token without the session epoch. Probe the
  // same read here so a database outage is visible before the operator types,
  // instead of surfacing later as an unexplained HTTP 500 (FID-151).
  const databaseReachable = config.configured
    ? await getAdminSessionEpoch()
        .then(() => true)
        .catch(() => false)
    : null;

  return (
    <LoginScreen
      configured={config.configured}
      databaseReachable={databaseReachable}
      diagnostics={readAdminDiagnostics(process.env, { databaseReachable })}
      notice={params.notice === "session"}
      reason={config.configured ? null : config.reason}
      returnTo={returnTo}
    />
  );
}
