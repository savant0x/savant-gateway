import type { ModelSummary } from "@/lib/types";

import Link from "next/link";

import { formatNumber } from "@/components/dashboard/format";
import { siteOrigin } from "@/config/site";

export type FreeAllocationMode = "daily" | "lifetime";

type Props = {
  mode: FreeAllocationMode;
  model: ModelSummary;
  signedIn: boolean;
};

function faqItems(mode: FreeAllocationMode, weight: number) {
  const weightedThousand = formatNumber(1_000 * weight);

  return [
    {
      question: "What exactly is the free allocation?",
      answer:
        mode === "daily"
          ? "A capped share of the gateway's shared daily free pool, measured in weighted tokens. It is not unlimited free usage: the operator sets the pool, each activated account receives a fair share that is capped per account, and the gateway keeps a safety reserve."
          : "A one-time weighted-token grant attached to your account. It is not a daily pool and it does not reset. It covers free-pool models until it is used.",
    },
    {
      question: "How is usage counted on this model?",
      answer: `Every raw input token and every raw output token costs ${weight} weighted tokens here. A request totalling 1,000 raw tokens therefore consumes ${weightedThousand} weighted tokens. An unused reservation is returned when the request settles.`,
    },
    {
      question: "When does it reset, and does it carry over?",
      answer:
        mode === "daily"
          ? "At 00:00 UTC every day. Unused allocation does not carry over, and a fresh upstream capacity observation is required after the reset before new credits can be spent."
          : "It does not reset. The grant remains until it is used and is not replenished automatically.",
    },
    {
      question: "What do allocated, used, reserved and available mean?",
      answer:
        mode === "daily"
          ? "Allocated is the share recorded for you today. Used is settled weighted usage. Reserved is the estimate held for requests still in flight; the unused part comes back when they settle. Available is what the admission path can spend right now, after settled usage and in-flight holds."
          : "Granted is the one-time total. Used is settled weighted usage. Reserved is the estimate held for requests still in flight; the unused part comes back when they settle. Available is what the admission path can spend right now, after settled usage and in-flight holds.",
    },
    {
      question: "Does free usage debit my prepaid credit?",
      answer:
        mode === "daily"
          ? "Not on the free-pool path. Those calls settle against the allocation only. If an active plan covers this model, the plan's included or overage policy is resolved first, and a plan with credit overage can settle on credit. The free-pool path itself never charges the wallet."
          : "Not while the trial covers the call. When a request's estimate exceeds the remaining trial, the gateway tries the configured paid counterpart; if that route has enough prepaid credit, the whole request settles there at the published paid rates. Without enough credit, the call is refused with 402. The trial balance is never converted to credit.",
    },
    {
      question: "Why can the free pool be unavailable?",
      answer:
        "Free capacity belongs to the upstream provider and is observed, not guaranteed. A missing or stale observation, a provider that disallows free usage, or a pool near its safety floor makes the gateway refuse the call instead of overdrawing the pool. A capacity refusal is not converted to credit; a trial that cannot cover the request may use its configured paid pair. Retry later, check the current state on your account, or use a paid SKU.",
    },
    {
      question: "How many requests will my allocation cover?",
      answer:
        "There is no fixed request count. Prompt size, output budget and this model's weight all consume the balance. A short call on a light model can fit many times; a long call on a heavy model can use the balance in one request.",
    },
    {
      question: "Does a subscription take precedence?",
      answer:
        "If an active plan includes this model, the plan's included or overage policy is resolved before the free pool. A past-due subscription blocks the call before either free or credit routing. Otherwise the free allocation is tried first.",
    },
    {
      question: "Where can I see the exact balance?",
      answer:
        mode === "daily"
          ? "The account page shows the current allocation, used and reserved totals, and can request a fresh upstream check. This page shows the last stored observation for your account. The usage table lists settled calls."
          : "The account page shows the trial grant, used and reserved totals. Its usage table records the charge for each settled call, including a request that used the configured paid pair.",
    },
  ];
}

export function FreeAllocationGuide({ mode, model, signedIn }: Props) {
  const weight = Math.max(1, Math.floor(model.tokenWeight) || 1);
  const items = faqItems(mode, weight);
  const body = JSON.stringify({
    model: model.id,
    messages: [{ role: "user", content: "Hello" }],
  });
  const request = `curl ${siteOrigin}/v1/chat/completions \\
  -H "Authorization: Bearer $SAVANT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`;

  return (
    <section className="mt-6 border-t border-black/10 pt-5 dark:border-white/10">
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">
        Using the free allocation
      </h3>

      <ol className="mt-4 space-y-4">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 font-mono text-[11px] text-emerald-300">
            1
          </span>
          <div>
            <p className="text-sm font-medium">
              {signedIn
                ? "Confirm an active key"
                : "Create an account and sign in"}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {signedIn ? (
                <>
                  Open{" "}
                  <Link
                    className="text-accent underline-offset-4 hover:underline"
                    href="/account"
                  >
                    your account
                  </Link>{" "}
                  to manage keys and see the current balance.{" "}
                  {mode === "daily"
                    ? "An account with no active key is not counted in the daily split."
                    : "The trial cannot be used without an active key."}
                </>
              ) : (
                <>
                  Create an account at{" "}
                  <Link
                    className="text-accent underline-offset-4 hover:underline"
                    href="/signup"
                  >
                    /signup
                  </Link>
                  , then sign in. A free call still needs an active scoped key;{" "}
                  {mode === "daily"
                    ? "an account without one is not counted in the daily split."
                    : "the trial cannot be used without one."}
                </>
              )}
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 font-mono text-[11px] text-emerald-300">
            2
          </span>
          <div>
            <p className="text-sm font-medium">Create a scoped key</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              On the account page, create a key for this project. The secret is
              shown once, so store it before leaving the page. Every key on the
              account shares one allocation.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 font-mono text-[11px] text-emerald-300">
            3
          </span>
          <div>
            <p className="text-sm font-medium">
              Send a Chat Completions request
            </p>
            <p className="mt-1 text-xs leading-5 text-muted">
              Use this SKU&apos;s public id exactly. The OpenAI SDK works too:
              set its base URL to <span className="mono">{siteOrigin}/v1</span>{" "}
              and its API key to the scoped key.
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-black/10 bg-black/20 p-3 text-[11px] leading-5 dark:border-white/10">
              <code>{request}</code>
            </pre>
            <p className="mt-2 text-xs leading-5 text-muted">
              Replace <span className="mono">$SAVANT_API_KEY</span> with the key
              you created.
            </p>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/10 font-mono text-[11px] text-emerald-300">
            4
          </span>
          <div>
            <p className="text-sm font-medium">Watch the settlement</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {mode === "daily"
                ? "The account page shows used and in-flight totals. A refused free-pool call carries an allowance or capacity error instead of a completion; it does not debit prepaid credit. Wait for the reset or choose a paid SKU."
                : "The account page shows used and in-flight totals. If the trial cannot cover a request, check whether the configured paid pair settled it from credit; otherwise the gateway returns 402. The usage table records the charge for each settled call."}
            </p>
          </div>
        </li>
      </ol>

      <details className="mt-5 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <summary className="cursor-pointer text-sm font-semibold">
          Free allocation FAQ
        </summary>
        <dl className="mt-4 space-y-4">
          {items.map((item) => (
            <div key={item.question}>
              <dt className="text-sm font-medium">{item.question}</dt>
              <dd className="mt-1 text-xs leading-5 text-muted">
                {item.answer}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
