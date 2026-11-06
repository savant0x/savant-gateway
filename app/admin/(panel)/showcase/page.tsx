import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { ShowcaseReview } from "@/components/admin/showcase-review";
import {
  listAdminShowcaseBuilds,
  listShowcaseRights,
  listShowcaseSources,
} from "@/lib/store";
import {
  PELICAN_LICENSE_TEXT,
  PELICAN_RESULT_PATH,
} from "@/lib/visual-builds/pelican";
import { visualBuildsEnabled } from "@/lib/visual-builds/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin visual builds",
  robots: { index: false, follow: false },
};

export default async function AdminShowcasePage() {
  if (!visualBuildsEnabled()) notFound();

  const [sources, builds] = await Promise.all([
    listShowcaseSources(),
    listAdminShowcaseBuilds(50),
  ]);
  const rights = await Promise.all(
    sources.map((source) => listShowcaseRights(source.id, 1)),
  );
  const published = builds.filter((build) => build.visibility === "published");
  const pending = builds.filter((build) => build.bindingState !== "accepted");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Showcase
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Visual build review
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            A build is public only while three independent facts agree: the
            current rights decision permits display, cache and redistribution;
            the binding names an active catalog model with the exact reviewed
            identity; and the build is explicitly published. Name similarity is
            never enough.
          </p>
        </div>
        <div className="rounded-xl border border-black/10 bg-surface px-3 py-2 text-xs text-muted dark:border-white/10">
          {builds.length} imported · {published.length} published ·{" "}
          {pending.length} awaiting binding
        </div>
      </div>

      <ShowcaseReview
        builds={builds}
        licenseText={PELICAN_LICENSE_TEXT}
        resultPath={PELICAN_RESULT_PATH}
        rights={rights.flat()}
        sources={sources}
      />
    </>
  );
}
