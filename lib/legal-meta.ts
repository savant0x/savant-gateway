export type PolicySlug = "terms" | "privacy" | "refunds" | "acceptable-use";

/** Directory name, URL segment and the value stored on an acceptance row. */
export const POLICY_VERSION = "v1.1";
/** Human version shown alongside the effective date. */
export const POLICY_VERSION_LABEL = "1.1";
export const POLICY_EFFECTIVE_DATE = "2026-10-30";
export const POLICY_EFFECTIVE_LABEL = "30 October 2026";
export const POLICY_OPERATOR = "Savant AI";
export const POLICY_JURISDICTION = "Kentucky, United States";
export const POLICY_CONTACT = "spencerhowell84@gmail.com";

export type PolicyMeta = {
  slug: PolicySlug;
  title: string;
  navLabel: string;
  summary: string;
};

export const POLICIES: Record<PolicySlug, PolicyMeta> = {
  terms: {
    slug: "terms",
    title: "Terms of service",
    navLabel: "Terms",
    summary:
      "The service, accounts and keys, prepaid credit, availability, suspension, liability and changes.",
  },
  privacy: {
    slug: "privacy",
    title: "Privacy notice",
    navLabel: "Privacy",
    summary:
      "What is stored, who receives it, cookies, retention, your requests and your rights.",
  },
  refunds: {
    slug: "refunds",
    title: "Refunds and disputes",
    navLabel: "Refunds",
    summary:
      "How credit and charges work, failed and partial requests, when a charge is refunded, and disputes.",
  },
  "acceptable-use": {
    slug: "acceptable-use",
    title: "Acceptable use",
    navLabel: "Acceptable use",
    summary:
      "What you must not do with the service, your responsibility for content, and how enforcement works.",
  },
};

export const POLICY_SLUGS = Object.keys(POLICIES) as PolicySlug[];
/** Every published version, newest last. Older versions stay readable at
 * `/legal/<version>/<slug>` and are never edited. */
export const POLICY_VERSIONS = ["v1", POLICY_VERSION];

export function isPolicySlug(value: string): value is PolicySlug {
  return Object.hasOwn(POLICIES, value);
}

export function isPolicyVersion(value: string): boolean {
  return POLICY_VERSIONS.includes(value);
}

/** Current-version documents live at a stable route; older text stays under
 * `/legal/<version>/<slug>` so a customer can see what applied to a purchase. */
export function policyHref(
  slug: PolicySlug,
  version: string = POLICY_VERSION,
): string {
  return version === POLICY_VERSION ? `/${slug}` : `/legal/${version}/${slug}`;
}
