"use client";

import type { ModelSummary } from "@/lib/types";

import { Button } from "@heroui/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { formatPricePer1M } from "@/components/dashboard/format";

export function ModelPriceEngine({ models }: { models: ModelSummary[] }) {
  const priced = models.filter(
    (model) =>
      model.access === "paid" &&
      (model.inputPricePer1M > 0 || model.outputPricePer1M > 0),
  );
  const initial =
    priced.find((model) => model.id === "deepseek-v4-flash") ?? priced[0];
  const [selectedId, setSelectedId] = useState(initial?.id ?? "");
  const selected = priced.find((model) => model.id === selectedId) ?? initial;
  const families = ["DeepSeek", "GPT", "Claude"].filter((family) =>
    priced.some((model) => model.family === family),
  );
  const sameRate =
    selected !== undefined &&
    selected.inputPricePer1M > 0 &&
    selected.inputPricePer1M === selected.outputPricePer1M;

  return (
    <div>
      <p className="mb-3 flex justify-between font-mono text-[9px] tracking-widest text-muted">
        <span>01 / THE MODEL EXCHANGE</span>
        <span className="text-accent">COMPARE THE COST</span>
      </p>
      <div className="price-engine">
        <div className="engine-heading">
          <span>CHOOSE YOUR ENGINE</span>
          <Image alt="" height={32} src="/logo.png" width={32} />
        </div>
        <div className="engine-body">
          {selected ? (
            <>
              <div
                aria-label="Model families"
                className="mb-5 flex flex-wrap gap-2"
                role="group"
              >
                {families.map((family) => (
                  <Button
                    key={family}
                    aria-pressed={selected.family === family}
                    className="flex-1 font-mono text-[10px]"
                    size="sm"
                    variant={
                      selected.family === family ? "primary" : "secondary"
                    }
                    onPress={() =>
                      setSelectedId(
                        priced.find((model) => model.family === family)?.id ??
                          selected.id,
                      )
                    }
                  >
                    {family}
                  </Button>
                ))}
              </div>
              <label className="mb-3 block font-mono text-[10px] text-muted">
                Select a priced model
                <select
                  className="mt-2 h-10 w-full border border-border bg-background px-3 text-foreground"
                  value={selected.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {priced.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
              <div aria-atomic="true" aria-live="polite">
                <p className="break-all font-mono text-[10px] text-muted">
                  {selected.id}
                </p>
                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <strong className="engine-price">
                    {formatPricePer1M(selected.inputPricePer1M)}
                  </strong>
                  <span className="engine-unit">
                    {sameRate
                      ? "per 1M tokens, in and out"
                      : "per 1M input tokens"}
                  </span>
                </div>
                {/* Equal rates printed the same figure twice, one line above the
                    other. It is one price when input and output cost the same. */}
                {sameRate ? null : (
                  <p className="mt-2 font-mono text-[11px] text-accent">
                    {formatPricePer1M(selected.outputPricePer1M)} / 1M output
                    tokens
                  </p>
                )}
                <dl className="engine-details">
                  <div>
                    <dt>Context</dt>
                    <dd>{selected.contextWindow}</dd>
                  </div>
                  <div>
                    <dt>Billing</dt>
                    <dd>Prepaid usage</dd>
                  </div>
                  <div>
                    <dt>Connection</dt>
                    <dd>OpenAI-compatible</dd>
                  </div>
                </dl>
              </div>
            </>
          ) : (
            <p className="py-8 text-muted">
              Priced models will appear here when the catalog is available.
            </p>
          )}
        </div>
        <div className="engine-footer">
          <span>CONFIGURED RETAIL PRICES</span>
          <Link className="text-accent" href="#models">
            Compare all models ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
