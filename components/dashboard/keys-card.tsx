"use client";

import type { KeySummary } from "@/lib/types";

import { Button, Card, Input, Spinner } from "@heroui/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { StatusChip } from "./chips";
import { responseError } from "./format";

import { LocalTime } from "@/components/local-time";

export function KeysCard({ keys }: { keys: KeySummary[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleCreateKey() {
    setCreating(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json().catch(() => null)) as {
        key?: KeySummary;
        secret?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.secret) {
        throw new Error(payload?.error || (await responseError(response)));
      }

      setCreatedSecret(payload.secret);
      setName("");
      setNotice(
        `Created ${payload.key?.prefix ?? "a new key"}. The secret is shown once.`,
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not create the key",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: KeySummary) {
    if (
      !window.confirm(
        `Revoke ${key.prefix}? Requests using it will stop working.`,
      )
    ) {
      return;
    }

    setRevoking(key.id);
    setError(null);

    try {
      const response = await fetch(`/api/keys/${key.id}`, { method: "DELETE" });

      if (!response.ok) throw new Error(await responseError(response));

      setNotice(`Revoked ${key.prefix}.`);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not revoke the key",
      );
    } finally {
      setRevoking(null);
    }
  }

  async function copySecret() {
    if (!createdSecret) return;

    try {
      await navigator.clipboard.writeText(createdSecret);
      setCopyLabel("Copied");
      window.setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch {
      setError(
        "Clipboard access was denied. Select and copy the key manually.",
      );
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Consumer keys</Card.Title>
        <Card.Description>
          Only a SHA-256 hash is stored. The full secret is returned once.
        </Card.Description>
      </Card.Header>
      <Card.Content className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Key name"
            className="w-full"
            placeholder="Key name (optional)"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            className="shrink-0"
            isDisabled={creating}
            variant="primary"
            onPress={handleCreateKey}
          >
            {creating ? <Spinner size="sm" /> : null}
            {creating ? "Creating" : "Create key"}
          </Button>
        </div>

        {createdSecret ? (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-success">
                  Copy this secret now
                </p>
                <p className="mt-1 text-xs text-muted">
                  It is not retrievable from the database later.
                </p>
              </div>
              <Button size="sm" variant="secondary" onPress={copySecret}>
                {copyLabel}
              </Button>
            </div>
            <pre className="mono mt-3 overflow-auto rounded-lg bg-black/30 p-3 text-xs">
              {createdSecret}
            </pre>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
            {notice}
          </p>
        ) : null}

        <div className="space-y-2">
          {keys.length === 0 ? (
            <p className="rounded-xl bg-surface p-4 text-sm text-muted">
              No keys yet. Create one to test the gateway.
            </p>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-surface p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{key.name}</span>
                    <StatusChip status={key.status} />
                  </div>
                  <div className="mono mt-1 text-xs text-muted">
                    {key.prefix}
                  </div>
                  <div className="mt-1 text-[11px] text-muted">
                    Created <LocalTime value={key.createdAt} /> · Last used{" "}
                    <LocalTime value={key.lastUsedAt} />
                  </div>
                </div>
                {key.status === "active" ? (
                  <Button
                    isDisabled={revoking === key.id}
                    size="sm"
                    variant="danger-soft"
                    onPress={() => handleRevoke(key)}
                  >
                    {revoking === key.id ? "Revoking" : "Revoke"}
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card.Content>
    </Card>
  );
}
