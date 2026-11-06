import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { VisualBuildViewer } from "@/components/showcase/visual-build-viewer";
import { getPublishedVisualBuild, getPublishedVisualBundle } from "@/lib/store";
import { visualBuildsEnabled } from "@/lib/visual-builds/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  if (!visualBuildsEnabled()) return { title: "Not found" };

  const build = await getPublishedVisualBuild((await params).id);

  return build
    ? {
        title: `${build.title} — visual build`,
        description: `${build.modelName}: ${build.description}`,
      }
    : { title: "Visual build not found" };
}

export default async function VisualBuildPage({ params }: PageProps) {
  if (!visualBuildsEnabled()) notFound();

  const id = (await params).id;
  const build = await getPublishedVisualBuild(id);

  if (!build) notFound();

  const bundle = await getPublishedVisualBundle(id);

  if (!bundle) notFound();

  return (
    <div className="site-shell">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[80rem] px-4 py-10 sm:px-6 lg:px-8">
        <Link
          className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
          href="/showcase"
        >
          ← All visual builds
        </Link>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div>
            <VisualBuildViewer html={bundle.html} title={build.title} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-300">
                {build.sourceLabel} · {build.effort} effort
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
                {build.title}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted">
                {build.description ||
                  "The canonical Pelican prompt, rendered once."}
              </p>
              <dl className="mt-5 space-y-3 text-xs">
                <div>
                  <dt className="text-muted">Bound catalog model</dt>
                  <dd className="mt-0.5 font-medium">
                    <Link
                      className="text-accent underline-offset-4 hover:underline"
                      href={`/models/${build.modelId}`}
                    >
                      {build.modelName}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Source model label</dt>
                  <dd className="mono mt-0.5">{build.originalModelId}</dd>
                </div>
                <div>
                  <dt className="text-muted">Source status</dt>
                  <dd className="mt-0.5">
                    {build.sourceStatus} · validation {build.validationState}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Artifact SHA-256</dt>
                  <dd className="mono mt-0.5 break-all text-[11px]">
                    {build.artifactSha256}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Published</dt>
                  <dd className="mt-0.5">
                    {new Date(build.publishedAt).toISOString().slice(0, 10)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-black/10 bg-surface p-5 text-xs leading-5 text-muted dark:border-white/10">
              <h2 className="font-semibold text-foreground">
                What this proves
              </h2>
              <p className="mt-2">
                An exact catalog id matched the source record when the operator
                published it, and the same catalog identity still matches now.
                It does not prove that this gateway route produced the artifact,
                nor that the upstream model was not prompted.
              </p>
              <a
                className="mt-3 inline-block text-accent underline-offset-4 hover:underline"
                href={build.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open the source record →
              </a>
              <p className="mt-3 border-t border-white/10 pt-3 text-[11px]">
                {build.rightsAttribution}. {build.licenseText.split("\n")[0]}.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
