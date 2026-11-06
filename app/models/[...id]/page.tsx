import type { Metadata } from "next";
import type { IdentityPublishedView } from "@/lib/identity/types";
import type { Coverage } from "@/lib/content/types";
import type { DailyTrialSummary } from "@/lib/storage/store/daily-trial";
import type { TrialBalance } from "@/lib/storage/ledger/trials";

import Link from "next/link";
import { notFound } from "next/navigation";

import { FreeAllocationPanel } from "@/components/catalog/free-allocation-panel";
import { CoveragePanel } from "@/components/content/coverage-panel";
import { ModelVisualBuilds } from "@/components/showcase/model-visual-builds";
import { IdentityPanel } from "@/components/identity/identity-panel";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { AccessChip } from "@/components/dashboard/chips";
import { formatPricePer1M } from "@/components/dashboard/format";
import { catalogSkuName } from "@/lib/catalog-skus";
import { contentEnabled } from "@/lib/content/policy";
import { isWatching } from "@/lib/content/store/engagement";
import { listContentForModel } from "@/lib/content/store/links";
import { getCustomerSession } from "@/lib/customer-auth";
import { readPublishedIdentity } from "@/lib/identity/reads";
import {
  getCatalogData,
  getDailyTrialSummary,
  listPublishedVisualBuilds,
} from "@/lib/store";
import { trialBalance } from "@/lib/storage/ledger/trials";
import { getDatabase } from "@/lib/storage/runtime";
import { readTrialConfig } from "@/lib/trials";
import {
  type VisualBuildPublicRow,
  visualBuildsEnabled,
} from "@/lib/visual-builds/types";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string[] }> };

function modelIdFrom(segments: string[]) {
  return segments.join("/");
}

async function findModel(segments: string[]) {
  const id = modelIdFrom(segments);
  const catalog = await getCatalogData();

  return catalog.models.find((model) => model.id === id) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const model = await findModel((await params).id);

  if (!model) return { title: "Model not found" };

  const name = catalogSkuName(model);

  return {
    title: `${name} — price and identity`,
    description: `${name} on Savant Gateway: ${model.family}, ${model.contextWindow} context, ${model.groupLabel} access, and the latest published identity check.`,
    twitter: { card: "summary_large_image", images: [] },
  };
}

/**
 * Public model detail (FID-087).
 *
 * The catch-all exists because public ids contain `/` (`free/gpt-6-luna`). The
 * identity read is wrapped: a database problem renders the unavailable panel,
 * never a 500 on a page that also has to sell the model.
 */
export default async function ModelDetailPage({ params }: PageProps) {
  const model = await findModel((await params).id);

  if (!model) notFound();

  let identity: IdentityPublishedView | null = null;
  let unavailable = false;
  let coverage: Coverage | null = null;
  let watching = false;
  let visualBuilds: VisualBuildPublicRow[] = [];
  let dailyAllocation: DailyTrialSummary | null = null;
  let lifetimeAllocation: TrialBalance | null = null;
  let allocationUnavailable = false;
  const showContent = contentEnabled();
  const showVisualBuilds = visualBuildsEnabled();
  const customer = await getCustomerSession().catch(() => null);
  const trialConfig = readTrialConfig();
  const allocationMode = trialConfig.enabled ? "lifetime" : "daily";

  if (model.access === "free" && customer) {
    try {
      if (trialConfig.enabled) {
        lifetimeAllocation = await trialBalance(
          await getDatabase(),
          customer.id,
          new Date().toISOString(),
        );
      } else {
        dailyAllocation = await getDailyTrialSummary(customer.id);
      }
    } catch {
      allocationUnavailable = true;
    }
  }

  try {
    const db = await getDatabase();

    identity = await readPublishedIdentity(db, model.id);
  } catch {
    unavailable = true;
  }

  if (showContent) {
    try {
      const db = await getDatabase();

      coverage = await listContentForModel(db, model.id, 6);
      watching = customer ? await isWatching(db, customer.id, model.id) : false;
    } catch {
      coverage = null;
    }
  }

  if (showVisualBuilds) {
    try {
      visualBuilds = await listPublishedVisualBuilds({
        modelId: model.id,
        limit: 3,
      });
    } catch {
      visualBuilds = [];
    }
  }

  const inputPrice = formatPricePer1M(model.inputPricePer1M);
  const outputPrice = formatPricePer1M(model.outputPricePer1M);

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[80rem] px-4 py-14 sm:px-6 lg:px-8">
            <Link
              className="text-xs font-medium uppercase tracking-[0.16em] text-cyan-300 underline-offset-4 hover:underline"
              href="/models"
            >
              ← All models
            </Link>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.04em]">
                  {catalogSkuName(model)}
                </h1>
                <p className="mono mt-2 text-sm text-muted">{model.id}</p>
              </div>
              <AccessChip model={model} />
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              {model.family} · {model.contextWindow} context ·{" "}
              {model.groupLabel} access · token weight {model.tokenWeight}×.
              Prices below are the gateway&apos;s sell price per million tokens.
            </p>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-[80rem] gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:px-8">
          <div className="space-y-6">
            <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                Price
              </h2>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted">Input / 1M tokens</dt>
                  <dd className="mt-1 text-2xl font-semibold">{inputPrice}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Output / 1M tokens</dt>
                  <dd className="mt-1 text-2xl font-semibold">{outputPrice}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs leading-5 text-muted">
                {model.access === "free"
                  ? "This SKU has no per-token dollar charge. Its free allocation, reset, FAQ and first-call walkthrough are below."
                  : model.access === "subscription"
                    ? "This model requires an active subscription whose plan includes its group."
                    : "Paid usage is settled from prepaid credit at the listed rate."}
              </p>
            </div>

            {model.access === "free" ? (
              <FreeAllocationPanel
                daily={dailyAllocation}
                lifetime={lifetimeAllocation}
                mode={allocationMode}
                model={model}
                signedIn={Boolean(customer)}
                unavailable={allocationUnavailable}
              />
            ) : null}

            <div className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
                Capabilities
              </h2>
              <ul className="mt-4 space-y-2 text-sm text-muted">
                <li className="flex items-center gap-2">
                  <i
                    aria-hidden
                    className={`fa-solid ${
                      model.supportsTools
                        ? "fa-circle-check"
                        : "fa-circle-xmark"
                    } text-xs`}
                  />
                  Tool calling{" "}
                  {model.supportsTools ? "supported" : "not advertised"}
                </li>
                <li className="flex items-center gap-2">
                  <i
                    aria-hidden
                    className={`fa-solid ${
                      model.supportsVision
                        ? "fa-circle-check"
                        : "fa-circle-xmark"
                    } text-xs`}
                  />
                  Vision {model.supportsVision ? "supported" : "not advertised"}
                </li>
                <li className="flex items-center gap-2">
                  <i
                    aria-hidden
                    className="fa-solid fa-window-maximize text-xs"
                  />
                  Advertised window {model.contextWindow} tokens
                </li>
              </ul>
            </div>

            {showVisualBuilds ? (
              <ModelVisualBuilds builds={visualBuilds} modelName={model.name} />
            ) : null}

            {showContent && coverage ? (
              <CoveragePanel
                coverage={coverage}
                model={model}
                signedIn={Boolean(customer)}
                watching={watching}
              />
            ) : null}

            <IdentityPanel unavailable={unavailable} view={identity} />
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-surface p-5 text-sm dark:border-white/10">
              <h2 className="font-semibold">Use this model</h2>
              <p className="mt-2 text-xs leading-5 text-muted">
                Calls go through the OpenAI-compatible gateway with your own
                scoped key. The public model id above is the value to send in
                the request body.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  className="rounded-lg bg-foreground px-3 py-2 text-center text-sm font-medium text-background transition-opacity hover:opacity-90"
                  href="/dashboard"
                >
                  Open the console
                </Link>
                <Link
                  className="rounded-lg border border-black/10 px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                  href={model.access === "paid" ? "/account" : "/models"}
                >
                  {model.access === "paid" ? "Add credit" : "Back to catalog"}
                </Link>
              </div>
            </div>

            <div className="rounded-xl border border-black/10 bg-surface p-5 text-xs leading-5 text-muted dark:border-white/10">
              <p className="font-semibold text-foreground">
                About identity checks
              </p>
              <p className="mt-2">
                A published check is advisory evidence from dated probes. It is
                not a guarantee of model weights, precision, or the absence of
                an upstream prompt.
              </p>
              <Link
                className="mt-3 inline-block text-accent underline-offset-4 hover:underline"
                href="/identity"
              >
                How the checks work
              </Link>
            </div>
          </aside>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
