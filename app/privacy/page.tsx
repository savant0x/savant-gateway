import type { Metadata } from "next";

import { PolicyDocument } from "@/components/legal/policy-document";
import { POLICIES } from "@/lib/legal";

export const metadata: Metadata = {
  title: POLICIES.privacy.title,
  description: POLICIES.privacy.summary,
};

export default function PrivacyPage() {
  return <PolicyDocument slug="privacy" />;
}
