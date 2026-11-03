"use client";

import { Button } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type CheckState = "idle" | "checking" | "checked" | "error";

/**
 * Manual refresh for the server-rendered free-allocation panel (FID-150).
 *
 * It fetches the mode-aware snapshot first, then asks the server to render it
 * again. The last rendered balance stays on screen through a failure: this
 * control never substitutes a zero or an optimistic number.
 */
export function FreeAllocationCheck() {
  const router = useRouter();
  const [state, setState] = useState<CheckState>("idle");
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function check() {
    if (state === "checking") return;

    setState("checking");

    try {
      const response = await fetch("/api/account/allocation", {
        cache: "no-store",
      });

      if (!response.ok) throw new Error("Allocation unavailable.");

      const payload = (await response.json()) as {
        mode?: string;
        daily?: unknown;
        lifetime?: unknown;
      };

      if (payload.mode !== "daily" && payload.mode !== "lifetime") {
        throw new Error("Allocation unavailable.");
      }

      setCheckedAt(new Date());
      setState("checked");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button
        isDisabled={state === "checking"}
        size="sm"
        variant="secondary"
        onPress={() => void check()}
      >
        {state === "checking" ? "Checking…" : "Check now"}
      </Button>
      <span aria-live="polite" className="text-xs leading-5 text-muted">
        {state === "checked" && checkedAt ? (
          <>
            Checked just now at {checkedAt.toLocaleTimeString()}. The figures
            above were read again from the gateway.
          </>
        ) : state === "error" ? (
          "Could not read your allocation. Nothing was changed or charged; the figures above are from this page load."
        ) : (
          "Reads the same allowance admission uses. Nothing is charged."
        )}
      </span>
    </div>
  );
}
