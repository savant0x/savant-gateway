"use client";

import { Button, Input, Spinner } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error || `Sign in failed (HTTP ${response.status})`,
        );
      }

      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
      setPassword("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label
          className="mb-1 block text-xs font-medium text-muted"
          htmlFor="admin-password"
        >
          Admin password
        </label>
        <Input
          autoComplete="current-password"
          className="w-full"
          id="admin-password"
          placeholder="••••••••••••"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}

      <Button
        className="w-full"
        isDisabled={submitting || password.length === 0}
        type="submit"
        variant="primary"
      >
        {submitting ? <Spinner size="sm" /> : null}
        {submitting ? "Checking" : "Sign in"}
      </Button>
    </form>
  );
}
