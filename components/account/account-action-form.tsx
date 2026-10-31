"use client";

import { Button, Input } from "@heroui/react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { responseError } from "@/components/dashboard/format";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/customer";

export function AccountActionForm() {
  const [action, setAction] = useState<{
    token: string;
    purpose: "verify" | "reset";
  } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("token");
    const purpose = params.get("purpose");

    window.history.replaceState(null, "", window.location.pathname);
    if (token && (purpose === "verify" || purpose === "reset"))
      setAction({ token, purpose });
  }, []);

  async function consume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);

    try {
      const response = await fetch("/api/auth/email/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...action,
          ...(action.purpose === "reset" ? { password } : {}),
        }),
      });

      if (!response.ok) throw new Error(await responseError(response));
      setComplete(true);
      setMessage(
        action.purpose === "verify"
          ? "Your email is verified."
          : "Your password was reset. Existing sessions and API keys were revoked. Sign in and create a new key.",
      );
      setAction(null);
      setPassword("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The link could not be consumed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={consume}>
      <h1 className="text-2xl font-semibold">Confirm your account action</h1>
      {action?.purpose === "reset" ? (
        <>
          <label className="block text-sm" htmlFor="reset-password">
            New password
          </label>
          <Input
            required
            autoComplete="new-password"
            id="reset-password"
            maxLength={MAX_PASSWORD_LENGTH}
            minLength={MIN_PASSWORD_LENGTH}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="text-sm text-muted">
            Resetting revokes all sessions and API keys.
          </p>
        </>
      ) : null}
      {action ? (
        <Button isDisabled={busy} type="submit">
          {busy
            ? "Confirming"
            : action.purpose === "verify"
              ? "Verify email"
              : "Reset password"}
        </Button>
      ) : !complete ? (
        <p className="text-sm text-muted">
          Open the newest link from your email. Links expire and can be used
          once.
        </p>
      ) : null}
      <p aria-live="polite" className="text-sm text-muted">
        {message}
      </p>
      <Link className="text-accent" href="/login">
        Return to sign in
      </Link>
    </form>
  );
}
