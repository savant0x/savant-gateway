import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/policy-document";
import { POLICIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: POLICIES.terms.title,
  description: POLICIES.terms.summary,
};

export default function TermsPage() {
  return <PolicyDocument slug="terms" />;
}
