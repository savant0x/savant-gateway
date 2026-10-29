import type { ProviderStatus } from "@/lib/types";

import { Chip } from "@heroui/react";

import { formatDate } from "./format";

import { ProviderSyncButton } from "@/components/provider-sync";

export function Hero({ provider }: { provider: ProviderStatus }) {
  const providerReady =
    provider.configured && provider.status !== "unconfigured";

  return (
    <section className="hero-glow -mx-4 overflow-hidden rounded-3xl border border-black/10 px-5 py-8 sm:mx-0 sm:px-8 dark:border-white/10">
      <div className="max-w-3xl">
        <div className="flex flex-wrap gap-2">
          <Chip color="accent" size="sm" variant="soft">
            Full catalog
          </Chip>
          <Chip color="accent" size="sm" variant="soft">
            Credit settled
          </Chip>
          <Chip color="default" size="sm" variant="soft">
            SQLite
          </Chip>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          Every model, one gateway.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          Sync the provider, price the paid rows, and route the whole catalog
          through one OpenAI-compatible endpoint. Free calls stay free; paid
          calls settle against tenant credit.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <ProviderSyncButton />
        <a
          className="inline-flex h-9 items-center justify-center rounded-xl border border-black/10 bg-surface px-4 text-sm font-medium transition-colors hover:border-accent/40 dark:border-white/10"
          href="#keys"
        >
          <i aria-hidden className="fa-solid fa-key mr-2 text-accent" />
          Create a consumer key
        </a>
        <span className="text-xs text-muted">
          {providerReady
            ? `Synced ${formatDate(provider.syncedAt)}`
            : "Add PROVIDER_KEY to .env.local, then sync."}
        </span>
      </div>
    </section>
  );
}
