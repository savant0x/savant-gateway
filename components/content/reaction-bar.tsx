"use client";

import type {
  ContentReaction,
  ContentReactionSummary,
} from "@/lib/content/types";

import Link from "next/link";
import { useState } from "react";

import { formatCount } from "@/lib/content/format";

const LABELS: Record<ContentReaction, string> = {
  useful: "Useful",
  insightful: "Insightful",
};

export function ReactionBar({
  itemId,
  initial,
  signedIn,
}: {
  itemId: string;
  initial: ContentReactionSummary[];
  signedIn: boolean;
}) {
  const [summary, setSummary] = useState(initial);
  const [busy, setBusy] = useState<ContentReaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(reaction: ContentReaction) {
    const current = summary.find((entry) => entry.reaction === reaction);

    if (!signedIn || busy) return;

    setBusy(reaction);
    setError(null);

    try {
      const response = await fetch(
        `/api/content/${encodeURIComponent(itemId)}/reactions`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reaction, active: !current?.mine }),
        },
      );
      const payload = (await response.json()) as {
        error?: string;
        reactions?: ContentReactionSummary[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Could not update that reaction.");
      }

      if (payload.reactions) setSummary(payload.reactions);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update that reaction.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
        Reactions
      </span>
      <div
        aria-label="Reactions"
        className="flex flex-wrap items-center gap-1.5"
        role="group"
      >
        {summary.map((entry) => (
          <button
            key={entry.reaction}
            aria-pressed={entry.mine}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60 ${
              entry.mine
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-black/10 text-muted hover:text-foreground dark:border-white/10"
            }`}
            disabled={!signedIn || busy !== null}
            title={
              signedIn
                ? `${LABELS[entry.reaction]}: ${entry.count}`
                : "Sign in to react"
            }
            type="button"
            onClick={() => toggle(entry.reaction)}
          >
            {LABELS[entry.reaction]}{" "}
            <span className="font-mono">{formatCount(entry.count)}</span>
          </button>
        ))}
      </div>
      {signedIn ? null : (
        <Link
          className="text-[11px] text-muted underline-offset-4 hover:text-foreground hover:underline"
          href="/login"
        >
          Sign in to react
        </Link>
      )}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </div>
  );
}
