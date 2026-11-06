import type { VisualBuildPublicRow } from "@/lib/visual-builds/types";

import Image from "next/image";
import Link from "next/link";

function effort(value: string) {
  return value === "unspecified" ? "effort unstated" : `${value} effort`;
}

export function VisualBuildCard({ build }: { build: VisualBuildPublicRow }) {
  return (
    <article className="group overflow-hidden rounded-xl border border-black/10 bg-surface transition-colors hover:border-cyan-300/40 dark:border-white/10">
      <Link className="block" href={`/showcase/${build.buildId}`}>
        <div className="relative aspect-video overflow-hidden bg-[#071018]">
          {build.thumbnailSha256 ? (
            // A private route, not a CDN key: every request repeats the rights gate.
            <Image
              fill
              unoptimized
              alt={`Pelican visual build for ${build.modelName}`}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              src={`/api/showcase/${build.buildId}/preview`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted">
              Preview unavailable
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-200">
            {effort(build.effort)}
          </span>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-semibold leading-5">{build.title}</h3>
            <i
              aria-hidden
              className="fa-solid fa-arrow-up-right-from-square mt-0.5 text-xs text-cyan-300"
            />
          </div>
          <p className="text-xs leading-5 text-muted">
            {build.description ||
              "The canonical Pelican prompt, rendered once."}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted">
            <span className="rounded-full border border-white/10 px-2 py-0.5">
              {build.modelName}
            </span>
            <span>{build.creator}</span>
            <span>·</span>
            <span className="mono">{build.validationState}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
