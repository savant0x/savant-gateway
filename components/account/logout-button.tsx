"use client";

import { Button, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Button
      isDisabled={pending}
      size="sm"
      variant="ghost"
      onPress={handleLogout}
    >
      {pending ? <Spinner size="sm" /> : null}
      {pending ? "Signing out" : "Sign out"}
    </Button>
  );
}
