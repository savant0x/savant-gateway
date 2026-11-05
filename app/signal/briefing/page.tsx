import type { Metadata } from "next";

import Link from "next/link";

import { ContentCard } from "@/components/content/content-card";
import { ContentDisabled } from "@/components/content/content-disabled";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { contentDate, relationLabel } from "@/lib/content/format";
import { contentEnabled } from "@/lib/content/policy";
import {
  briefingForUser,
  listWatchedModelIds,
} from "@/lib/content/store/engagement";
import { listItems } from "@/lib/content/store/items";
import { getCustomerSession } from "@/lib/customer-auth";
import { getCatalogData, recordActivityBestEffort } from "@/lib/store";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Signal briefing",
  description: "New coverage for the models you follow.",
};

export default async function SignalBriefingPage() {
  if (!contentEnabled()) {
    return (
      <div className="site-shell">
        <SiteHeader />
        <main>
          <ContentDisabled />
        </main>
        <SiteFooter />
      </div>
    );
  }

  const customer = await getCustomerSession();
  const db = await getDatabase();
  const catalog = await getCatalogData();
  const modelsById = new Map(catalog.models.map((model) => [model.id, model]));

  const watched = customer ? await listWatchedModelIds(db, customer.id) : [];
  const groups = customer ? await briefingForUser(db, customer.id) : [];
  const latest = await listItems(db, { limit: 6 });

  if (customer) {
    await recordActivityBestEffort({
      userId: customer.id,
      actor: "customer",
      kind: "briefing_return",
      entityType: "page",
      entityId: "briefing",
      metadata: { source: "briefing" },
    });
  }

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
              Your briefing
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
              The last seven days of coverage for the models you follow. This is
              a chronological read, not a recommendation score.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
          {!customer ? (
            <div className="rounded-xl border border-black/10 bg-surface p-6 dark:border-white/10">
              <h2 className="text-lg font-semibold">Follow a model first</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                Sign in, open any model, and press Follow model. New coverage
                for that model appears here. Without a session, the latest
                public pieces are shown below.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
                  href="/login"
                >
                  Sign in
                </Link>
                <Link
                  className="rounded-lg border border-black/10 px-4 py-2 text-sm font-medium dark:border-white/10"
                  href="/models"
                >
                  Browse models
                </Link>
              </div>
            </div>
          ) : watched.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-surface p-6 dark:border-white/10">
              <h2 className="text-lg font-semibold">No models followed yet</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
                You are watching {watched.length} of 30 allowed models. Open a
                model and press Follow model to start a briefing.
              </p>
              <Link
                className="mt-4 inline-block rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background"
                href="/models"
              >
                Find a model
              </Link>
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-xl border border-black/10 bg-surface p-6 dark:border-white/10">
              <h2 className="text-lg font-semibold">
                No new coverage this week
              </h2>
              <p className="mt-2 text-sm text-muted">
                You follow {watched.length}{" "}
                {watched.length === 1 ? "model" : "models"}, but no linked piece
                was published in the window. The latest public pieces are below.
              </p>
            </div>
          ) : (
            groups.map((group) => {
              const model = modelsById.get(group.modelId);

              return (
                <section key={group.modelId}>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold">
                        {model?.name ?? group.modelId}
                      </h2>
                      <p className="mono text-[11px] text-muted">
                        {group.modelId}
                      </p>
                    </div>
                    <Link
                      className="text-xs text-accent hover:underline"
                      href={`/models/${group.modelId}`}
                    >
                      Model page →
                    </Link>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-black/10 p-3 dark:border-white/10"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span className="text-accent">
                            {relationLabel(item.relation)}
                          </span>
                          <span>{item.sourceLabel}</span>
                          <span aria-hidden>·</span>
                          <span>{contentDate(item.publishedAt)}</span>
                        </div>
                        <Link
                          className="mt-1 block text-sm font-medium underline-offset-4 hover:underline"
                          href={`/signal/${item.id}`}
                        >
                          {item.title}
                        </Link>
                        <p className="mt-1 text-[11px] text-muted">
                          {item.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}

          {latest.items.length > 0 ? (
            <section>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {customer ? "Latest across Signal" : "Latest public pieces"}
                </h2>
                <Link
                  className="text-xs text-accent hover:underline"
                  href="/signal"
                >
                  Open the hub →
                </Link>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latest.items.map((item) => (
                  <ContentCard key={item.id} compact item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
