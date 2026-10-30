"use client";

import type { SupportRequestRow } from "@/lib/store/support";

import { Button, Chip, Input, Spinner } from "@heroui/react";
import { useState } from "react";

import { LocalTime } from "@/components/local-time";
import { responseError } from "@/components/dashboard/format";
import { SUPPORT_KIND_LABELS } from "@/lib/support";

export function SupportQueue({ initial }: { initial: SupportRequestRow[] }) {
  const [requests, setRequests] = useState(initial);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: string) {
    setBusy(id);
    setError(null);

    try {
      const response = await fetch("/api/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, note: notes[id] ?? "" }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as { request: SupportRequestRow };

      setRequests((current) =>
        current.map((request) =>
          request.id === payload.request.id ? payload.request : request,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not resolve request.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (requests.length === 0) {
    return (
      <p className="rounded-lg border border-white/10 p-4 text-sm text-white/60">
        No customer requests yet. This queue is written only by an authenticated
        account.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}

      {requests.map((request) => (
        <article
          key={request.id}
          className="rounded-lg border border-white/10 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white/90">
                {request.subject}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {SUPPORT_KIND_LABELS[request.kind]} · {request.customerName} ·{" "}
                {request.customerEmail} ·{" "}
                <LocalTime value={request.createdAt} />
              </p>
            </div>
            <Chip
              color={request.status === "open" ? "warning" : "success"}
              size="sm"
            >
              {request.status}
            </Chip>
          </div>

          <p className="mt-3 whitespace-pre-wrap text-sm text-white/80">
            {request.message}
          </p>

          {request.status === "open" ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Resolution note for ${request.subject}`}
                className="min-w-56 flex-1"
                placeholder="Resolution note (visible to the customer)"
                value={notes[request.id] ?? ""}
                onChange={(event) =>
                  setNotes((current) => ({
                    ...current,
                    [request.id]: event.target.value,
                  }))
                }
              />
              <Button
                isDisabled={busy === request.id}
                size="sm"
                variant="primary"
                onPress={() => resolve(request.id)}
              >
                {busy === request.id ? <Spinner size="sm" /> : null}
                Mark resolved
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-white/50">
              Resolved <LocalTime value={request.resolvedAt ?? ""} />
              {request.resolutionNote ? ` — ${request.resolutionNote}` : ""}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
