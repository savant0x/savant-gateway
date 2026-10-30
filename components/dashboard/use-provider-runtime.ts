"use client";

import type { ProviderStatus } from "@/lib/types";

import { useCallback, useEffect, useRef, useState } from "react";

import { observationIsRecent, quotaIsCurrent } from "@/lib/provider-quota";

/** A failed or pending check clears current figures, including network failures. */
export function useAccountCheck<T>(initial: T, path: string, field: string) {
  const [value, setValue] = useState<T | null>(initial);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (pending.current) return;

    const controller = new AbortController();

    pending.current = controller;
    setChecking(true);
    setValue(null);
    setError(null);

    try {
      const response = await fetch(path, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as Record<string, T | undefined>;

      const checked = payload[field];

      if (!response.ok || !checked) throw new Error("Account unavailable");
      if (!controller.signal.aborted) setValue(checked);
    } catch {
      if (!controller.signal.aborted) {
        setError(
          "Current account values are unavailable. Check again shortly.",
        );
      }
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) {
        setNow(Date.now());
        setChecking(false);
      }
    }
  }, [path, field]);

  useEffect(() => {
    if (!pending.current) {
      setValue(initial);
      setNow(Date.now());
    }
  }, [initial]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 1_000);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", visible);

    return () => {
      clearInterval(clock);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", visible);
      pending.current?.abort();
    };
  }, [refresh]);

  return { value, now, checking, error, refresh };
}

export function useProviderRuntime(initial: ProviderStatus) {
  const live = useAccountCheck(initial, "/api/provider/runtime", "provider");
  const { value: provider, now } = live;
  const quotaCurrent = provider !== null && quotaIsCurrent(provider, now);
  const balanceCurrent =
    provider !== null && observationIsRecent(provider.balanceObservedAt, now);

  return { ...live, provider, quotaCurrent, balanceCurrent };
}
