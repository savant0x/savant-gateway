"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <Button
      isDisabled={pending}
      size="sm"
      variant="secondary"
      onPress={handleLogout}
    >
      <i aria-hidden className="fa-solid fa-arrow-right-from-bracket" />
      {pending ? "Signing out" : "Sign out"}
    </Button>
  );
}
