"use client";

import type { SupportSummary } from "@/lib/support";

import { Button, Card, Chip, Input, Spinner } from "@heroui/react";
import { useState } from "react";

import { LocalTime } from "@/components/local-time";
import { responseError } from "@/components/dashboard/format";
import {
  SUPPORT_KINDS,
  SUPPORT_KIND_LABELS,
  type SupportKind,
} from "@/lib/support";

const FIELD_CLASS =
  "w-full rounded-xl border border-black/10 bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:border-accent dark:border-white/10";

export function SupportCard({ initial }: { initial: SupportSummary[] }) {
  const [requests, setRequests] = useState(initial);
  const [kind, setKind] = useState<SupportKind>("support");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setSending(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch("/api/account/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, subject, message }),
      });

      if (!response.ok) throw new Error(await responseError(response));

      const payload = (await response.json()) as {
        request: SupportSummary;
      };

      setRequests((current) => [payload.request, ...current]);
      setSubject("");
      setMessage("");
      setNotice(
        `Request ${payload.request.id} was recorded. The operator sees it in the support queue.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not record the request.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <Card.Header>
        <Card.Title>Support and data requests</Card.Title>
        <Card.Description>
          Messages sent here are stored with your account and reviewed by the
          operator. There is no public form and no message is sent to a third
          party.
        </Card.Description>
      </Card.Header>

      <Card.Content className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-xs text-muted">
            <span>Request type</span>
            <select
              aria-label="Request type"
              className={FIELD_CLASS}
              value={kind}
              onChange={(event) => setKind(event.target.value as SupportKind)}
            >
              {SUPPORT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {SUPPORT_KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 text-xs text-muted">
            <span>Subject</span>
            <Input
              aria-label="Subject"
              maxLength={120}
              placeholder="Short summary"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>
        </div>

        <label className="block space-y-1 text-xs text-muted">
          <span>Message</span>
          <textarea
            aria-label="Message"
            className={`${FIELD_CLASS} min-h-28`}
            maxLength={4000}
            placeholder="What do you need help with?"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        {error ? (
          <p className="text-xs text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="text-xs text-success" role="status">
            {notice}
          </p>
        ) : null}

        <Button
          isDisabled={sending}
          size="sm"
          variant="primary"
          onPress={submit}
        >
          {sending ? <Spinner size="sm" /> : null}
          Send request
        </Button>

        {requests.length === 0 ? (
          <p className="text-xs text-muted">
            No requests yet. Deletion and privacy requests go through this same
            queue so they are recorded against your account.
          </p>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="rounded-xl border border-black/10 bg-surface px-3 py-2 dark:border-white/10"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{request.subject}</p>
                  <Chip
                    color={request.status === "open" ? "warning" : "success"}
                    size="sm"
                  >
                    {request.status}
                  </Chip>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {SUPPORT_KIND_LABELS[request.kind]} ·{" "}
                  <LocalTime value={request.createdAt} />
                </p>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-5">
                  {request.message}
                </p>
                {request.resolutionNote ? (
                  <p className="mt-2 rounded-lg border border-accent/30 bg-accent/10 px-2 py-1 text-xs">
                    Operator note: {request.resolutionNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
