import type { Metadata } from "next";

import { AccountActionForm } from "@/components/account/account-action-form";

export const metadata: Metadata = {
  title: "Account confirmation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AccountActionPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-4 py-16">
      <AccountActionForm />
    </main>
  );
}
