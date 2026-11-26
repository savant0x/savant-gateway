import type { Metadata } from "next";

import { GatewaySettings } from "@/components/admin/gateway-settings";
import { CONTEXT_BANNER_MAX_CHARS } from "@/lib/context-banner";
import { getBannerConfig } from "@/lib/store-facade/catalog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin gateway",
  robots: { index: false, follow: false },
};

export default async function AdminGatewayPage() {
  const banner = await getBannerConfig();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Gateway
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Context banner
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            The text every upstream chat request carries. Enabling it injects a
            system message ahead of the customer&apos;s conversation.
          </p>
        </div>
      </div>

      <GatewaySettings
        banner={banner}
        bannerMaxChars={CONTEXT_BANNER_MAX_CHARS}
      />
    </>
  );
}
