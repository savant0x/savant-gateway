import type { Metadata } from "next";

import { MomentumPage } from "@/components/content/momentum-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signal rising — measured source momentum",
  description:
    "Signal items whose source-reported views, likes, comments or repository stars rose over a named window.",
};

export default function SignalRisingPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string; window?: string }>;
}) {
  return <MomentumPage mode="rising" searchParams={searchParams} />;
}
