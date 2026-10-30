"use client";

import { Button, Input, Spinner } from "@heroui/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { responseError } from "@/components/dashboard/format";
import { MIN_PASSWORD_LENGTH } from "@/lib/customer";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSignup && !accepted) {
      setError(
        "Accept the terms of service and the privacy notice to create an account.",
      );

      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isSignup
            ? { name, email, password, acceptedPolicies: accepted }
            : { email, password },
        ),
      });

      if (!response.ok) {
        throw new Error(await responseError(response));
      }

      router.replace("/account");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Something went wrong.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {isSignup ? (
        <div className="space-y-1.5 text-sm">
          <label className="text-muted" htmlFor="auth-name">
            Name
          </label>
          <Input
            required
            aria-label="Name"
            autoComplete="name"
            className="w-full"
            id="auth-name"
            maxLength={80}
            placeholder="Ada Lovelace"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      ) : null}

      <div className="space-y-1.5 text-sm">
        <label className="text-muted" htmlFor="auth-email">
          Email
        </label>
        <Input
          required
          aria-label="Email"
          autoComplete="email"
          className="w-full"
          id="auth-email"
          placeholder="you@company.com"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="space-y-1.5 text-sm">
        <label className="text-muted" htmlFor="auth-password">
          Password
        </label>
        <Input
          required
          aria-label="Password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          className="w-full"
          id="auth-password"
          minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
          placeholder={isSignup ? "12+ characters" : "Your password"}
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {isSignup ? (
          <span className="block text-[11px] text-muted">
            At least {MIN_PASSWORD_LENGTH} characters. Stored as a salted scrypt
            hash.
          </span>
        ) : null}
      </div>

      {isSignup ? (
        <div className="text-xs leading-5 text-muted">
          <label className="flex items-start gap-2" htmlFor="auth-policies">
            <input
              required
              checked={accepted}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              id="auth-policies"
              type="checkbox"
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>
              I am 18 or older and accept the{" "}
              <Link className="text-accent hover:underline" href="/terms">
                terms of service
              </Link>
              , the{" "}
              <Link className="text-accent hover:underline" href="/privacy">
                privacy notice
              </Link>
              , the{" "}
              <Link className="text-accent hover:underline" href="/refunds">
                refund policy
              </Link>{" "}
              and the{" "}
              <Link
                className="text-accent hover:underline"
                href="/acceptable-use"
              >
                acceptable use policy
              </Link>
              .
            </span>
          </label>
        </div>
      ) : null}

      {error ? (
        <p
          className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <Button
        className="w-full"
        isDisabled={submitting}
        type="submit"
        variant="primary"
      >
        {submitting ? <Spinner size="sm" /> : null}
        {submitting
          ? isSignup
            ? "Creating account"
            : "Signing in"
          : isSignup
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted">
        {isSignup ? "Already have an account? " : "New to the gateway? "}
        <Link
          className="text-accent hover:underline"
          href={isSignup ? "/login" : "/signup"}
        >
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
