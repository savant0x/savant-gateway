import type { VisualBuildPublicRow } from "@/lib/visual-builds/types";

import Image from "next/image";
import Link from "next/link";

export function ModelVisualBuilds({
  builds,
  modelName,
}: {
  builds: VisualBuildPublicRow[];
  modelName: string;
}) {
  if (builds.length === 0) return null;

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
            Pelican visual builds
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            One canonical 3D prompt, rendered by {modelName} in a dated one-shot
            record. These are not gateway requests or a quality score.
          </p>
        </div>
        <Link
          className="text-[11px] font-medium text-accent underline-offset-4 hover:underline"
          href="/showcase"
        >
          All builds →
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {builds.slice(0, 3).map((build) => (
          <Link
            key={build.buildId}
            className="group overflow-hidden rounded-lg border border-black/10 dark:border-white/10"
            href={`/showcase/${build.buildId}`}
          >
            <div className="aspect-video overflow-hidden bg-[#071018]">
              {build.thumbnailSha256 ? (
                <Image
                  fill
                  unoptimized
                  alt={`Pelican visual build for ${build.modelName}`}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  sizes="(min-width: 640px) 33vw, 100vw"
                  src={`/api/showcase/${build.buildId}/preview`}
                />
              ) : null}
            </div>
            <div className="p-3">
              <p className="truncate text-xs font-medium">{build.title}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {build.effort} effort · {build.validationState}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
