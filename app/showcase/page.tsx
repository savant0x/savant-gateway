import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { VisualBuildCard } from "@/components/showcase/visual-build-card";
import { listPublishedVisualBuilds } from "@/lib/store";
import { visualBuildsEnabled } from "@/lib/visual-builds/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model-matched visual builds",
  description:
    "Published Pelican prompt artifacts, each bound to an exact catalog model after rights and identity review.",
};

export default async function ShowcasePage() {
  if (!visualBuildsEnabled()) notFound();

  const builds = await listPublishedVisualBuilds({ limit: 48 });
  const models = new Set(builds.map((build) => build.modelId));

  return (
    <div className="site-shell">
      <SiteHeader />
      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-14 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Showcase · exact identity
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              One prompt. Different hands.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Each artifact is the unprompted response to the same Pelican
              drawing task, published only after a recorded rights decision and
              an exact model-id binding. These are dated one-shot records, not a
              ranking and not a claim that the rendered model was served by this
              gateway.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 canvas-surface px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-cube mr-2 text-cyan-300"
                />
                {builds.length} published build{builds.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/10 canvas-surface px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-fingerprint mr-2 text-cyan-300"
                />
                {models.size} bound model{models.size === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/10 canvas-surface px-3 py-1.5">
                <i
                  aria-hidden
                  className="fa-solid fa-scale-balanced mr-2 text-emerald-300"
                />
                rights reviewed
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-6 lg:px-8">
          {builds.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-surface p-8 text-sm leading-6 text-muted">
              <h2 className="text-base font-semibold text-foreground">
                Nothing is published yet
              </h2>
              <p className="mt-2 max-w-2xl">
                Imports can exist without being public. An operator must record
                display, cache and redistribution permission, accept the exact
                catalog model, and publish the revision. Until then this page
                stays empty rather than showing an unreviewed artifact.
              </p>
              <Link
                className="mt-4 inline-block text-accent underline-offset-4 hover:underline"
                href="/models"
              >
                Browse the model catalog
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {builds.map((build) => (
                <VisualBuildCard key={build.buildId} build={build} />
              ))}
            </div>
          )}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
