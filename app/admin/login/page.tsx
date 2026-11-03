import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/admin/login-screen";
import { readAdminDiagnostics } from "@/lib/admin-diagnostics";
import { getAdminSession } from "@/lib/admin-auth";
import { safeAdminReturnTo } from "@/lib/admin-return";
import { readAdminConfig } from "@/lib/admin-session";

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

  return (
    <LoginScreen
      configured={config.configured}
      diagnostics={readAdminDiagnostics()}
      notice={params.notice === "session"}
      reason={config.configured ? null : config.reason}
      returnTo={returnTo}
    />
  );
}
