import type { Metadata } from "next";
import type {
  IdentityCorrectionRecord,
  IdentityVerdictStatus,
} from "@/lib/identity/types";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { formatCalendarDay } from "@/components/dashboard/format";
import { DECISION } from "@/lib/identity/battery";
import { readCorrections } from "@/lib/identity/reads";
import { STATUS_LABELS, verdictSummary } from "@/lib/identity/view";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Identity methodology and corrections",
  description:
    "How Savant Gateway tests free-pool model routes, what the results can and cannot claim, when a result expires, and every correction the operator has recorded.",
  twitter: { card: "summary_large_image", images: [] },
};

const STATES: IdentityVerdictStatus[] = [
  "consistent",
  "self_consistent",
  "baseline",
  "inconclusive",
  "divergent_review",
  "mismatch_confirmed",
  "stale",
  "unsupported",
  "error",
];

const MEASURED = [
  {
    icon: "fa-receipt",
    title: "Protocol shape",
    body: "A non-streaming response and a streamed response must both parse, carry the expected fields, and report usage consistently.",
  },
  {
    icon: "fa-repeat",
    title: "Determinism",
    body: "Six fixed prompts are sent three times at temperature 0. After normalization the answers must agree across repeats.",
  },
  {
    icon: "fa-chart-simple",
    title: "Response distribution",
    body: "Twenty single-token samples on each of six fixed prompts are compared with a stored reference from the same protocol. The comparison reports only a state; the values stay internal.",
  },
  {
    icon: "fa-user-secret",
    title: "Canary leakage",
    body: "A random phrase is placed in a system message and the route is asked to repeat, summarize, or dump its instructions. An observed leak is a behavior finding.",
  },
  {
    icon: "fa-list-check",
    title: "Exact-answer canaries",
    body: "Twenty short factual prompts check that the route still answers ordinary questions correctly. This is corroboration, not a substitution verdict.",
  },
  {
    icon: "fa-book-open",
    title: "Context retrieval",
    body: "Two coded needles are placed at 819, 4,096, and 8,192 tokens, or at the advertised window when it is smaller.",
  },
  {
    icon: "fa-screwdriver-wrench",
    title: "Tool conformance",
    body: "Six schemas test nested objects, arrays, enums, required fields, a package command, and a no-extra-properties rule. A route that rejects tools is not tested.",
  },
  {
    icon: "fa-water",
    title: "Stream integrity",
    body: "Three streams check event types, usage monotonicity, the terminal event, and that the reported model field does not change mid-stream.",
  },
  {
    icon: "fa-superscript",
    title: "Logprobs",
    body: "When a route returns top log probabilities, top-1 agreement with the stored reference is reported descriptively. No top-k distribution claim is made.",
  },
];

const NOT_CLAIMED = [
  "That any particular weights are loaded or that execution uses a specific numeric precision. Both are outside what a black-box HTTP check can see.",
  "That token counts match a specific upstream tokenizer. Chat templates add delimiters, so this is not tested in protocol v2.",
  "That a route has no hidden system prompt. The canaries can show a leak when one exists; they cannot show its absence.",
  "That every substitution, fallback, or quantization change is caught. The battery covers the probes it sends and nothing else.",
  "That another gateway, reseller, or provider is worse. This page only reports first-party routes.",
  "A percentage score or a single trust number. Findings stay separate so one cannot hide another.",
];

function statusCopy(status: IdentityVerdictStatus) {
  return verdictSummary(status, {
    date: "the test date shown on the model page",
    n: 6,
    samples: 20,
    days: DECISION.ttlDays,
    reason: "the measured evidence was insufficient",
  });
}

function statusText(value: string | null) {
  if (!value) return "—";

  return STATUS_LABELS[value as IdentityVerdictStatus] ?? value;
}

function ledgerRow(correction: IdentityCorrectionRecord) {
  return (
    <li
      key={correction.id}
      className="rounded-xl border border-white/10 canvas-surface p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-xs text-cyan-200">
          {correction.targetModelId}
        </p>
        <p className="font-mono text-[11px] text-muted">
          {formatCalendarDay(correction.createdAt)}
        </p>
      </div>
      <p className="mt-2 text-sm">
        <span className="text-muted">
          {statusText(correction.statusBefore)}
        </span>{" "}
        <i
          aria-hidden
          className="fa-solid fa-arrow-right text-[10px] text-muted"
        />{" "}
        <span className="font-medium">
          {statusText(correction.statusAfter)}
        </span>
      </p>
      <p className="mt-1 text-sm leading-6 text-muted">
        {correction.operatorNote}
      </p>
    </li>
  );
}

export default async function IdentityMethodologyPage() {
  let corrections: IdentityCorrectionRecord[] | null = null;

  try {
    const db = await getDatabase();

    corrections = await readCorrections(db, 20);
  } catch {
    corrections = null;
  }

  return (
    <div className="site-shell">
      <SiteHeader />

      <main>
        <section className="hero-glow border-b border-white/10">
          <div className="mx-auto w-full max-w-[96rem] px-4 py-16 sm:px-6 lg:px-8">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">
              Savant Gateway · verification method
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              What the identity check measures
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
              Free-pool routes can be run through a sealed probe battery by the
              operator. A completed result stays private until the operator
              publishes it, and a published result always carries its date, its
              protocol, and the limits of what it observed.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[80rem] space-y-12 px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-2">
            {MEASURED.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-white/10 canvas-surface p-5"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  <i
                    aria-hidden
                    className={`fa-solid ${item.icon} text-cyan-300`}
                  />
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
              </article>
            ))}
          </div>

          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">
              What this result never claims
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              An external HTTP client sees request bytes, response bytes,
              reported token counters, returned log probabilities, and latency.
              Anything that requires reading the loaded weights on the serving
              hardware is outside the method.
            </p>
            <ul className="mt-5 space-y-3">
              {NOT_CLAIMED.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6">
                  <i
                    aria-hidden
                    className="fa-solid fa-circle-minus mt-1 text-[10px] text-rose-300"
                  />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">
              How to read a state
            </h2>
            <div className="mt-5 space-y-3">
              {STATES.map((status) => (
                <article
                  key={status}
                  className="rounded-xl border border-white/10 canvas-surface p-4"
                >
                  <p className="text-sm font-medium">{STATUS_LABELS[status]}</p>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {statusCopy(status)}
                  </p>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">
              Why a consistency result expires
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              Upstream checkpoints and serving configurations can change without
              a public model-string change. A consistency result therefore
              carries a {DECISION.ttlDays}-day validity window; after that date
              the model page shows it as stale until the route is checked again.
              A confirmed mismatch is a dated finding and stays visible with its
              date rather than turning into a current-state claim.
            </p>
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                  Correction ledger
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                  Publishing, unpublishing, and confirmed mismatches are
                  recorded here with the operator note. Raw evidence is never
                  shown on this page.
                </p>
              </div>
              <span className="font-mono text-[11px] text-muted">
                last 20 entries
              </span>
            </div>

            {corrections === null ? (
              <p className="mt-5 rounded-xl border border-white/10 canvas-surface p-4 text-sm text-muted">
                ledger unavailable
              </p>
            ) : corrections.length === 0 ? (
              <p className="mt-5 rounded-xl border border-white/10 canvas-surface p-4 text-sm text-muted">
                No correction has been recorded yet.
              </p>
            ) : (
              <ol className="mt-5 space-y-3">
                {corrections.map((correction) => ledgerRow(correction))}
              </ol>
            )}
          </section>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
