"use client";

import { Button, Card, Spinner } from "@heroui/react";
import Link from "next/link";
import { useState } from "react";

import { responseError } from "@/components/dashboard/format";

/**
 * Existing accounts were created before the policies were published, so there
 * is no acceptance on record for them. This asks once; the answer is stored
 * server-side and the card disappears after the server confirms it.
 */
export function PolicyAcceptanceCard({
  accepted,
  version,
  versionLabel,
  effectiveLabel,
}: {
  accepted: boolean;
  version: string;
  versionLabel: string;
  effectiveLabel: string;
}) {
  const [hidden, setHidden] = useState(accepted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  async function accept() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/account/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      setHidden(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not record the acceptance.",
      );
      setSaving(false);
    }
  }

  return (
    <Card variant="secondary">
      <Card.Header>
        <Card.Title>Policies version {versionLabel}</Card.Title>
        <Card.Description>
          These terms, the privacy notice, the refund policy and the acceptable
          use policy took effect on {effectiveLabel}. They are now published and
          apply to this account.
        </Card.Description>
      </Card.Header>

      <Card.Content className="space-y-3 text-sm">
        <p className="text-xs leading-6 text-muted">
          Read the{" "}
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
          <Link className="text-accent hover:underline" href="/acceptable-use">
            acceptable use policy
          </Link>
          . Your acceptance is recorded with its version and timestamp.
        </p>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          isDisabled={saving}
          size="sm"
          variant="primary"
          onPress={accept}
        >
          {saving ? <Spinner size="sm" /> : null}I accept these policies
        </Button>
      </Card.Content>
    </Card>
  );
}
