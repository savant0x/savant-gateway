import type { LandingData } from "@/lib/types";

import Link from "next/link";

import { CodeSample } from "./code-sample";
import { primaryCta, secondaryCta } from "./cta";

const CURL_SAMPLE = `curl http://localhost:3000/v1/chat/completions \\
  -H "Authorization: Bearer sk-..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "free/gpt-6-luna",
    "messages": [{ "role": "user", "content": "Hello" }],
    "stream": true
  }'`;

export function Hero({ data }: { data: LandingData }) {
  const nonFree = data.stats.paidModelCount + data.stats.subscriptionModelCount;

  return (
    <section className="hero-glow relative overflow-hidden border-b border-white/10">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-28">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-cyan-200">
              OpenAI-compatible
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-muted">
              {data.stats.modelCount > 0
                ? `${data.stats.modelCount} models · ${data.stats.freeModelCount} free`
                : "Catalog not synced yet"}
            </span>
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            One key.
            <br />
            <span className="bg-gradient-to-r from-cyan-200 via-cyan-300 to-sky-400 bg-clip-text text-transparent">
              Every model
            </span>
            <br />
            your provider carries.
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-muted">
            Savant Gateway syncs the full upstream catalog, prices paid rows
            against their upstream cost, and settles each call from a credit
            ledger. Free models stay free; paid rows are billed once priced, and
            every call is visible in analytics.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link className={primaryCta} href="/models">
              Browse the catalog
            </Link>
            <Link className={secondaryCta} href="/dashboard">
              Open the console
            </Link>
          </div>

          <p className="mt-6 text-xs text-muted">
            Consumer secrets are stored as SHA-256 hashes. The upstream key
            never leaves the server.
          </p>
        </div>

        <div className="relative">
          <div
            aria-hidden
            className="absolute -inset-6 rounded-[2rem] bg-cyan-400/10 blur-3xl"
          />
          <div className="relative">
            <CodeSample code={CURL_SAMPLE} label="POST /v1/chat/completions" />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3">
                <p className="text-lg font-semibold">{data.stats.modelCount}</p>
                <p className="text-[11px] text-muted">catalogued</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3">
                <p className="text-lg font-semibold text-cyan-300">{nonFree}</p>
                <p className="text-[11px] text-muted">non-free rows</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2 py-3">
                <p className="text-lg font-semibold text-emerald-300">
                  {data.stats.freeModelCount}
                </p>
                <p className="text-[11px] text-muted">free pool</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
