import type { Metadata } from "next";

import Link from "next/link";

import { formatCalendarDay } from "@/components/dashboard/format";
import { readDeploymentDiagnostics } from "@/lib/deployment-diagnostics";
import { listProviders } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin diagnostics",
  robots: { index: false, follow: false },
};

function State({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={
        ok
          ? "rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success"
          : "rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger"
      }
    >
      {label}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-t border-black/5 py-2 first:border-t-0 dark:border-white/5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mono min-w-0 break-all text-xs">{value}</dd>
    </div>
  );
}

export default async function AdminDiagnosticsPage() {
  const providers = await listProviders();
  const data = readDeploymentDiagnostics(
    process.env,
    providers.map((provider) => ({
      slug: provider.slug,
      label: provider.label,
      keyEnvVar: provider.keyEnvVar,
      enabled: provider.enabled,
    })),
  );
  const missingEnabled = data.providerKeys.filter(
    (provider) => provider.enabled && !provider.configured,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Diagnostics
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            What this runtime can see
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Local `.env.local` presence does not prove the hosted runtime has a
            key. This page reports the running deployment, the database read and
            provider-key presence only. Values, hashes and derived secrets are
            never rendered.
          </p>
        </div>
        <Link
          className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          href="/admin/providers"
        >
          Open providers →
        </Link>
      </div>

      {missingEnabled.length > 0 ? (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {missingEnabled.length} enabled provider
          {missingEnabled.length === 1 ? "" : "s"} cannot see a key:{" "}
          {missingEnabled.map((provider) => provider.keyEnvVar).join(", ")}. Set
          the variable in the Vercel project for the environment you are
          viewing, then redeploy.
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-black/10 bg-surface p-5 dark:border-white/10">
          <h2 className="text-sm font-semibold">Deployment</h2>
          <dl className="mt-3">
            <Detail label="Runtime" value={data.runtime} />
            <Detail
              label="Vercel environment"
              value={data.vercelEnv ?? "not a Vercel runtime"}
            />
            <Detail
              label="Commit"
              value={
                data.commit
                  ? `${data.commitShort} (${data.commit.slice(0, 12)}…)`
                  : "unknown"
              }
            />
            <Detail label="Branch" value={data.branch ?? "unknown"} />
            <Detail label="Repository" value={data.repository ?? "unknown"} />
            <Detail
              label="Public origin"
              value={data.siteOrigin ?? "not configured"}
            />
            <Detail
              label="Storage read"
              value="ok — this page loaded providers"
            />
            <Detail
              label="Observed"
              value={formatCalendarDay(data.generatedAt)}
            />
          </dl>
        </div>

        <div className="rounded-2xl border border-black/10 bg-surface p-5 dark:border-white/10">
          <h2 className="text-sm font-semibold">Provider keys</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            Only presence is reported. The registry stores the variable name, so
            this list is the complete set of credentials the gateway can ask
            for.
          </p>
          <ul className="mt-3 space-y-2">
            {data.providerKeys.map((provider) => (
              <li
                key={provider.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/5 px-3 py-2 dark:border-white/5"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium">
                    {provider.label}{" "}
                    {provider.enabled ? null : (
                      <span className="text-muted">(disabled)</span>
                    )}
                  </p>
                  <p className="mono truncate text-[11px] text-muted">
                    {provider.keyEnvVar}
                  </p>
                </div>
                <State
                  label={provider.configured ? "configured" : "missing"}
                  ok={provider.configured}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-black/10 bg-surface p-5 dark:border-white/10">
        <h2 className="text-sm font-semibold">Hosted checklist</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted">
          <li>
            In Vercel → Project → Settings → Environment Variables, add every
            provider key name shown above for Production and Preview.
          </li>
          <li>
            Confirm the Git integration deploys the intended branch. The commit
            and branch above must match the commit you pushed.
          </li>
          <li>
            Redeploy after changing an environment variable: existing
            deployments keep their old environment.
          </li>
          <li>
            Run a provider test on the Providers page and confirm this page
            reports the key as configured.
          </li>
          <li>
            Do not paste a secret into this page, a FID or a commit. The receipt
            records presence, not values.
          </li>
        </ol>
      </section>
    </>
  );
}
