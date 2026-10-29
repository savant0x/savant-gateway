import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { AuthScreen } from "@/components/account/auth-screen";
import { getCustomerSession } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  if (await getCustomerSession()) redirect("/account");

  return <AuthScreen mode="login" />;
}
