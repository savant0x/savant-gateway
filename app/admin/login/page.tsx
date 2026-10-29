import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/admin/login-screen";
import { getAdminSession } from "@/lib/admin-auth";
import { readAdminConfig } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  const config = readAdminConfig();

  return (
    <LoginScreen
      configured={config.configured}
      reason={config.configured ? null : config.reason}
    />
  );
}
