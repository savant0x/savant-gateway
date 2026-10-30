import type { Metadata } from "next";

import { notFound } from "next/navigation";

import { PolicyDocument } from "@/components/legal/policy-document";
import {
  isPolicySlug,
  isPolicyVersion,
  POLICIES,
  POLICY_SLUGS,
  POLICY_VERSIONS,
} from "@/lib/legal";

export const dynamicParams = false;

export function generateStaticParams() {
  return POLICY_VERSIONS.flatMap((version) =>
    POLICY_SLUGS.map((slug) => ({ version, slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ version: string; slug: string }>;
}): Promise<Metadata> {
  const { version, slug } = await params;

  if (!isPolicySlug(slug) || !isPolicyVersion(version)) return {};

  return {
    title: `${POLICIES[slug].title} (${version})`,
    description: POLICIES[slug].summary,
    alternates: { canonical: `/${slug}` },
  };
}

export default async function VersionedPolicyPage({
  params,
}: {
  params: Promise<{ version: string; slug: string }>;
}) {
  const { version, slug } = await params;

  if (!isPolicySlug(slug) || !isPolicyVersion(version)) notFound();

  return <PolicyDocument slug={slug} version={version} />;
}
