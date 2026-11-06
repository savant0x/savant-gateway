"use client";

import type {
  VisualBuildRights,
  VisualBuildSource,
} from "@/lib/visual-builds/types";

import { useState } from "react";

type Payload = Record<string, unknown>;

type Props = {
  sources: VisualBuildSource[];
  rights: VisualBuildRights[];
  busy: string | null;
  act: (key: string, payload: Payload) => Promise<void>;
};

/**
 * OpenRouter game artifacts (FID-2026-1104-013B).
 *
 * The operator supplies the exact observed record, prompt and license. The
 * server verifies both hashes, fetches only the approved asset origin and
 * refuses a document that is not self-contained. This panel never fetches.
 */
export function ShowcaseOpenRouterPanel({ sources, rights, busy, act }: Props) {
  const [recordText, setRecordText] = useState("");
  const [promptText, setPromptText] = useState("");
  const [licenseText, setLicenseText] = useState("");
  const [rightsState, setRightsState] = useState("approved");
  const [note, setNote] = useState(
    "Operator-approved OpenRouter game artifact.",
  );
  const [display, setDisplay] = useState(true);
  const [cache, setCache] = useState(true);
  const [redistribute, setRedistribute] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const source =
    sources.find((row) => row.kind === "openrouter_artifacts") ?? null;
  const current = rights.find((row) => row.sourceId === source?.id) ?? null;

  function importRecord() {
    setLocalError(null);

    if (!source) {
      setLocalError("Register the OpenRouter source first.");

      return;
    }
    if (!promptText.trim() || !licenseText.trim()) {
      setLocalError("The import needs the exact prompt and license text.");

      return;
    }

    let record: unknown;

    try {
      record = JSON.parse(recordText);
    } catch {
      setLocalError("The record is not valid JSON.");

      return;
    }

    void act("import-openrouter", {
      action: "import",
      sourceId: source.id,
      record,
      promptText,
      licenseText,
    });
  }

  return (
    <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold">3 · OpenRouter artifacts</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
            The observed record names one self-contained HTML document and
            thumbnail on the approved asset origin. Prompt and license hashes
            must match the text supplied here; the server refuses remote assets
            and never executes the document.
          </p>
        </div>
        {source ? (
          <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success">
            source registered · {current ? current.state : "no decision"}
          </span>
        ) : (
          <button
            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-white/10"
            disabled={busy !== null}
            type="button"
            onClick={() =>
              act("source-openrouter", {
                action: "source",
                kind: "openrouter_artifacts",
              })
            }
          >
            Register OpenRouter source
          </button>
        )}
      </div>

      {localError ? (
        <p className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
          {localError}
        </p>
      ) : null}

      {source ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              <span className="text-muted">Decision</span>
              <select
                className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                value={rightsState}
                onChange={(event) => setRightsState(event.target.value)}
              >
                <option value="approved">approved</option>
                <option value="pending">pending</option>
                <option value="withdrawn">withdrawn</option>
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted">Evidence note</span>
              <input
                className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            {[
              ["Display", display, setDisplay] as const,
              ["Cache", cache, setCache] as const,
              ["Redistribute", redistribute, setRedistribute] as const,
            ].map(([label, value, set]) => (
              <label key={label} className="flex items-center gap-2">
                <input
                  checked={value}
                  type="checkbox"
                  onChange={(event) => set(event.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>

          <button
            className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
            disabled={busy !== null || !licenseText.trim()}
            type="button"
            onClick={() =>
              act("rights-openrouter", {
                action: "rights",
                sourceId: source.id,
                state: rightsState,
                evidenceNote: note,
                licenseText,
                attribution: "OpenRouter artifact contributors",
                displayAllowed: display,
                cacheAllowed: cache,
                redistributeAllowed: redistribute,
              })
            }
          >
            Record decision
          </button>
          <span className="ml-2 self-center text-[11px] text-muted">
            Approved needs all three permissions and the license text.
          </span>

          <label className="block text-xs">
            <span className="text-muted">
              Record JSON (exactly as observed)
            </span>
            <textarea
              className="mt-1 min-h-32 w-full rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-[11px] dark:border-white/10"
              placeholder='{"externalId":"…","documentUrl":"https://model-assets.openrouter.ai/…html",…}'
              value={recordText}
              onChange={(event) => setRecordText(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted">Prompt text</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-[11px] dark:border-white/10"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-muted">License text</span>
            <textarea
              className="mt-1 min-h-20 w-full rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-[11px] dark:border-white/10"
              value={licenseText}
              onChange={(event) => setLicenseText(event.target.value)}
            />
          </label>
          <button
            className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
            disabled={busy !== null || !source.enabled}
            type="button"
            onClick={importRecord}
          >
            {busy === "import-openrouter"
              ? "Fetching and verifying…"
              : "Import record"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
