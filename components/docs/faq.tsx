import Link from "next/link";

import { FAQ_GROUPS } from "./faq-data";
import { DocsPage } from "./docs-page";

import { primaryCta, secondaryCta } from "@/components/landing/cta";

export function Faq() {
  return (
    <DocsPage
      active="faq"
      description="Short answers to the questions that come before the first request and after the first failure. For request fields and the exact error envelope, use the API reference."
      eyebrow="FAQ"
      title="Questions, answered plainly."
    >
      <div className="space-y-12">
        <nav aria-label="FAQ sections" className="flex flex-wrap gap-2 text-xs">
          {FAQ_GROUPS.map((group) => (
            <a
              key={group.id}
              className="rounded-full border border-white/10 canvas-surface px-3 py-1.5 text-muted transition-colors hover:text-foreground"
              href={`#${group.id}`}
            >
              {group.title}
            </a>
          ))}
        </nav>

        {FAQ_GROUPS.map((group) => (
          <section
            key={group.id}
            className="scroll-mt-24 space-y-4"
            id={group.id}
          >
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">
              {group.title}
            </h2>

            <div className="space-y-3">
              {group.items.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] open:border-cyan-300/30"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-sm font-medium">
                    {item.question}
                    <i
                      aria-hidden
                      className="fa-solid fa-chevron-down shrink-0 text-[10px] text-muted"
                    />
                  </summary>
                  <div className="space-y-3 border-t border-white/10 px-5 py-4">
                    <p className="text-sm leading-7 text-muted">
                      {item.answer}
                    </p>
                    {item.link ? (
                      <Link
                        className="inline-flex items-center gap-2 text-xs font-medium text-accent hover:underline"
                        href={item.link.href}
                      >
                        {item.link.label}
                        <i
                          aria-hidden
                          className="fa-solid fa-arrow-right text-[10px]"
                        />
                      </Link>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/10 via-white/[0.03] to-transparent p-6 sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            Still need a hand?
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Support requests are tied to a signed-in account and answered in the
            same queue. Start with the newcomer guide if you have not made a
            request yet.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link className={primaryCta} href="/support">
              Open support
            </Link>
            <Link className={secondaryCta} href="/docs/start">
              Read the newcomer guide
            </Link>
          </div>
        </section>
      </div>
    </DocsPage>
  );
}
