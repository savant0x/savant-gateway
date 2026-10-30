import type { Metadata } from "next";

import Link from "next/link";

import { primaryCta, secondaryCta } from "@/components/landing/cta";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { getCustomerSession } from "@/lib/customer-auth";
import { SUPPORT_KINDS, SUPPORT_KIND_LABELS } from "@/lib/support";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description:
    "How to reach the operator for account, billing, privacy and data requests.",
};

export default async function SupportPage() {
  const customer = await getCustomerSession();

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Support
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Talk to the operator.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Requests are submitted from your signed-in account and stored with
              it. There is no public contact form: every request is tied to an
              account, visible to the operator in the support queue, and its
              resolution note is shown back to you.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                className={primaryCta}
                href={customer ? "/account" : "/login"}
              >
                {customer ? "Open your account" : "Sign in to send a request"}
              </Link>
              <Link className={secondaryCta} href="/docs">
                Read the API reference
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">What you can ask for</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted">
                {SUPPORT_KINDS.map((kind) => (
                  <li key={kind}>
                    <span className="text-foreground">
                      {SUPPORT_KIND_LABELS[kind]}
                    </span>
                    {kind === "data-deletion"
                      ? " — recorded against your account; the operator reviews and performs any removal, and the request alone does not delete data."
                      : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-lg font-semibold">What happens next</h2>
              <ol className="mt-4 space-y-2 text-sm leading-6 text-muted">
                <li>1. Submit the request from your account page.</li>
                <li>
                  2. It appears in the operator queue with your account and the
                  time it was sent.
                </li>
                <li>
                  3. The operator reviews it and records a resolution note,
                  which your account shows on the request.
                </li>
              </ol>
              <p className="mt-4 text-xs leading-5 text-muted">
                No address, response-time guarantee or third-party ticket system
                is implied. Requests are handled by the operator of this
                deployment.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
