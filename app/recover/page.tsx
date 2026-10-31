import type { Metadata } from "next";

import { RecoveryForm } from "@/components/account/recovery-form";
import { readAccountEmailConfig } from "@/lib/account-email";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Password recovery",
  robots: { index: false, follow: false },
};

export default function RecoverPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-16">
      <RecoveryForm configured={Boolean(readAccountEmailConfig())} />
    </main>
  );
}
