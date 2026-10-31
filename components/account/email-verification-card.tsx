"use client";

import { Button, Card } from "@heroui/react";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";

export function EmailVerificationCard({
  verified,
  configured,
}: {
  verified: boolean;
  configured: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function requestVerification() {
    setBusy(true);

    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: "verify" }),
      });

      if (!response.ok) throw new Error(await responseError(response));
      setMessage(
        "Check your inbox. Open the newest link and confirm to verify your email.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not request verification.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Email ownership</Card.Title>
        <Card.Description>
          {verified
            ? "Your email address is verified."
            : configured
              ? "Confirm ownership using the newest verification link in your inbox."
              : "Email delivery is not configured. Your email address is unverified."}
        </Card.Description>
      </Card.Header>
      {!verified && configured ? (
        <Card.Content className="space-y-3">
          <Button isDisabled={busy} onPress={requestVerification}>
            {busy ? "Requesting email" : "Send verification email"}
          </Button>
          <p aria-live="polite" className="text-sm text-muted">
            {message}
          </p>
        </Card.Content>
      ) : null}
    </Card>
  );
}
