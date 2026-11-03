import type { Metadata } from "next";
import type { PublicContentSource } from "@/lib/content/types";

import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { StatePanel } from "@/components/ui/state-panel";
import { contentDate } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import { cachedPublicRead } from "@/lib/content/public-cache";
import { publicSourceAge } from "@/lib/content/source-guidance";
import {
  PUBLIC_SOURCE_KIND_LABELS,
  publicSourceState,
  publicSourceStateLabel,
  type PublicSourceState,
} from "@/lib/content/status";
import { listPublicSources } from "@/lib/content/store/sources";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signal source status",
  description:
    "A read-only view of which Signal sources are current, delayed, or paused. Internal error text is not published.",
  robots: { index: false, follow: false },
};

const STATE_CLASSES: Record<PublicSourceState, string> = {
  ok: "bg-success/10 text-success",
  delayed: "bg-amber-300/10 text-amber-200",
  attention: "bg-danger/10 text-danger",
  paused: "bg-black/10 text-muted dark:bg-white/10",
};

export default async function SignalStatusPage() {
  if (!contentEnabled()) notFound();

  let sources: PublicContentSource[] = [];
  let error: string | null = null;

  try {
    const db = await getDatabase();

    sources = await cachedPublicRead("signal:status:sources", () =>
      listPublicSources(db),
    );
  } catch {
    error = "Content is temporarily unavailable.";
  }

  const now = new Date();

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-12 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/signal"
            >
              ← Signal
            </Link>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
              Source status
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">
              This page reports the last successful fetch and a coarse state for
              each configured source. It does not publish upstream error text,
              feed URLs, or credentials.
            </p>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-muted">
              A source is delayed when no successful fetch has landed within two
              configured intervals plus a 15-minute grace period. Disabled
              sources stay listed as paused.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-8 sm:px-6 lg:px-8">
          {error ? (
            <StatePanel
              description="The source projection could not be read. This page will not claim the sources are healthy or absent."
              state="unavailable"
              title="Source status is temporarily unavailable."
            />
          ) : sources.length === 0 ? (
            <StatePanel
              description="The Signal surface is enabled but has no feeds yet. An operator can add one in Admin → Content."
              state="empty"
              title="No sources are configured."
            />
          ) : (
            <ul className="space-y-2">
              {sources.map((source) => {
                const state = publicSourceState(source, now);

                return (
                  <li
                    key={source.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-surface px-4 py-3 dark:border-white/10"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {source.label}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {PUBLIC_SOURCE_KIND_LABELS[source.kind]} · every{" "}
                        {source.fetchIntervalMinutes} min · last success:{" "}
                        {source.lastFetchedAt
                          ? `${contentDate(source.lastFetchedAt)} (${publicSourceAge(source.lastFetchedAt, now)})`
                          : "never"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATE_CLASSES[state]}`}
                    >
                      {publicSourceStateLabel(state)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 text-[11px] leading-5 text-muted">
            State is a gateway observation, not a guarantee about the
            publisher&apos;s current availability. A source that needs attention
            is retried by the operator; the next successful fetch returns it to
            current.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
