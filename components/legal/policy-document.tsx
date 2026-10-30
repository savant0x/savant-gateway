import type { PolicyBlock, InlineSegment } from "@/lib/legal-markdown";

import Link from "next/link";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  POLICIES,
  POLICY_CONTACT,
  POLICY_EFFECTIVE_DATE,
  POLICY_EFFECTIVE_LABEL,
  POLICY_JURISDICTION,
  POLICY_OPERATOR,
  POLICY_SLUGS,
  POLICY_VERSION,
  POLICY_VERSION_LABEL,
  policyHref,
  readPolicyBody,
  type PolicySlug,
} from "@/lib/legal";

function Inline({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((segment, index) => {
        const key = `${segment.kind}-${index}`;

        if (segment.kind === "strong") {
          return (
            <strong key={key} className="font-semibold text-foreground">
              {segment.value}
            </strong>
          );
        }

        if (segment.kind === "code") {
          return (
            <code
              key={key}
              className="rounded bg-white/10 px-1 py-0.5 text-[0.9em]"
            >
              {segment.value}
            </code>
          );
        }

        if (segment.kind === "link") {
          return (
            <a
              key={key}
              className="text-accent hover:underline"
              href={segment.href}
            >
              {segment.value}
            </a>
          );
        }

        return <span key={key}>{segment.value}</span>;
      })}
    </>
  );
}

function Blocks({ blocks }: { blocks: PolicyBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;

        if (block.kind === "heading") {
          return (
            <h2
              key={key}
              className="mt-10 text-lg font-semibold tracking-[-0.02em]"
            >
              {block.text}
            </h2>
          );
        }

        if (block.kind === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="pl-1">
              <Inline segments={item} />
            </li>
          ));

          return block.ordered ? (
            <ol
              key={key}
              className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-muted"
            >
              {items}
            </ol>
          ) : (
            <ul
              key={key}
              className="mt-4 list-disc space-y-2 pl-5 text-sm leading-7 text-muted"
            >
              {items}
            </ul>
          );
        }

        return (
          <p key={key} className="mt-4 text-sm leading-7 text-muted">
            <Inline segments={block.segments} />
          </p>
        );
      })}
    </>
  );
}

export function PolicyDocument({
  slug,
  version = POLICY_VERSION,
}: {
  slug: PolicySlug;
  version?: string;
}) {
  const meta = POLICIES[slug];
  const isCurrent = version === POLICY_VERSION;
  const blocks = readPolicyBody(version, slug);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          {meta.title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          Version {POLICY_VERSION_LABEL} · Effective{" "}
          <time dateTime={POLICY_EFFECTIVE_DATE}>{POLICY_EFFECTIVE_LABEL}</time>
        </p>
        <p className="mt-1 text-xs text-muted">
          {POLICY_OPERATOR} · {POLICY_JURISDICTION} ·{" "}
          <a
            className="text-accent hover:underline"
            href={`mailto:${POLICY_CONTACT}`}
          >
            {POLICY_CONTACT}
          </a>
          {isCurrent ? null : ` · superseded text, kept for reference`}
        </p>

        <nav
          aria-label="Customer policies"
          className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-y border-white/10 py-3 font-mono text-[11px] text-muted"
        >
          {POLICY_SLUGS.map((entry) => (
            <Link
              key={entry}
              className={
                entry === slug ? "text-foreground" : "hover:text-foreground"
              }
              href={policyHref(entry, version)}
            >
              {POLICIES[entry].navLabel}
            </Link>
          ))}
        </nav>

        <article className="pb-6">
          <Blocks blocks={blocks} />
        </article>

        <p className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-muted">
          This version is permanently reachable at{" "}
          <Link
            className="text-accent hover:underline"
            href={`/legal/${version}/${slug}`}
          >
            /legal/{version}/{slug}
          </Link>
          . A published version is never edited in place; a change is published
          as a new version with a new effective date.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
