"use client";

import { Button, Input } from "@heroui/react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { responseError } from "@/components/dashboard/format";

export function RecoveryForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "reset", email }),
      });

      if (!response.ok) throw new Error(await responseError(response));
      setMessage(
        "If an eligible account exists, a message was requested. If it does not arrive, retry later.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not request recovery.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-muted">
        {configured
          ? "Request a single-use link. Resetting your password revokes all sessions and API keys."
          : "Email delivery is not configured. Password recovery is unavailable until the operator configures it."}
      </p>
      {configured ? (
        <>
          <label className="block text-sm" htmlFor="recovery-email">
            Email
          </label>
          <Input
            required
            autoComplete="email"
            id="recovery-email"
            maxLength={254}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button isDisabled={busy} type="submit">
            {busy ? "Requesting link" : "Request reset link"}
          </Button>
        </>
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
