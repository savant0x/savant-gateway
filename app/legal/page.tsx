import type { Metadata } from "next";

import Link from "next/link";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import {
  POLICIES,
  POLICY_CONTACT,
  POLICY_EFFECTIVE_LABEL,
  POLICY_OPERATOR,
  POLICY_SLUGS,
  POLICY_VERSION,
  POLICY_VERSION_LABEL,
  policyHref,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Legal",
  description:
    "Published customer policies: terms, privacy notice, refunds and acceptable use.",
};

export default function LegalPage() {
  return (
    <div className="site-shell">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl px-4 pb-20 pt-14 sm:px-6 lg:px-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-accent">
          Legal
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
          Published policies.
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          {POLICY_OPERATOR} publishes these documents as versioned text. Version{" "}
          {POLICY_VERSION_LABEL} took effect on {POLICY_EFFECTIVE_LABEL}. A
          published version is not edited in place: a change is published as a
          new version with a new effective date, and earlier versions stay
          reachable.
        </p>

        <ul className="mt-8 divide-y divide-white/10 border-y border-white/10">
          {POLICY_SLUGS.map((slug) => (
            <li key={slug} className="py-4">
              <Link
                className="text-base font-medium hover:text-accent"
                href={policyHref(slug)}
              >
                {POLICIES[slug].title}
              </Link>
              <p className="mt-1 text-xs leading-6 text-muted">
                {POLICIES[slug].summary}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-xs leading-6 text-muted">
          Version {POLICY_VERSION_LABEL} is permanently reachable under{" "}
          <Link
            className="text-accent hover:underline"
            href={`/legal/${POLICY_VERSION}/terms`}
          >
            /legal/{POLICY_VERSION}/
          </Link>
          . Questions go to{" "}
          <a
            className="text-accent hover:underline"
            href={`mailto:${POLICY_CONTACT}`}
          >
            {POLICY_CONTACT}
          </a>{" "}
          or the support queue in your account.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
