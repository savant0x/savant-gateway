"use client";

import type {
  AdminVisualBuildRow,
  VisualBuildRights,
  VisualBuildSource,
} from "@/lib/visual-builds/types";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ShowcaseOpenRouterPanel } from "@/components/admin/showcase-openrouter-panel";
import { adminLoginHref } from "@/lib/admin-return";

type Props = {
  sources: VisualBuildSource[];
  rights: VisualBuildRights[];
  builds: AdminVisualBuildRow[];
  licenseText: string;
  resultPath: string;
};

type Payload = Record<string, unknown>;

export function ShowcaseReview({
  sources,
  rights,
  builds,
  licenseText,
  resultPath,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState("operator");
  const [rightsState, setRightsState] = useState("approved");
  const [rightsNote, setRightsNote] = useState(
    "Pinned Pelican repository and license reviewed by the operator.",
  );
  const [display, setDisplay] = useState(true);
  const [cache, setCache] = useState(true);
  const [redistribute, setRedistribute] = useState(true);
  const [importPath, setImportPath] = useState(resultPath);
  const [modelDraft, setModelDraft] = useState<Record<string, string>>({});
  const source = sources.find((row) => row.kind === "pelican_sdf") ?? null;
  const current = rights.find((row) => row.sourceId === source?.id) ?? null;

  async function act(key: string, payload: Payload) {
    setBusy(key);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, reviewer }),
      });

      if (response.status === 401) {
        router.replace(
          adminLoginHref(
            `${window.location.pathname}${window.location.search}`,
          ),
        );

        return;
      }

      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error || `Request failed (HTTP ${response.status})`,
        );
      }

      setMessage(
        key.startsWith("import") ? "Import stored for review." : "Done.",
      );
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "The request failed.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-xs text-success">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold">1 · Source and rights</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
              The pinned Pelican MIT repository is not by itself a grant to
              republish the generated artifact. Record a separate decision, then
              leave publication for the review table below. A later decision
              supersedes this one.
            </p>
          </div>
          {source ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2 py-1 text-[11px] text-success">
              source registered
            </span>
          ) : (
            <button
              className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
              disabled={busy !== null}
              type="button"
              onClick={() => act("source", { action: "source" })}
            >
              Register pinned Pelican source
            </button>
          )}
        </div>

        {source ? (
          <>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted">Revision</dt>
                <dd className="mono mt-0.5 break-all">{source.revision}</dd>
              </div>
              <div>
                <dt className="text-muted">Source</dt>
                <dd className="mt-0.5">
                  {source.enabled ? "enabled" : "disabled"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Current decision</dt>
                <dd className="mt-0.5">
                  {current
                    ? `${current.state} · ${current.reviewer}`
                    : "none — publication is blocked"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <span className="text-muted">Reviewer</span>
                <input
                  className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                />
              </label>
              <label className="text-xs sm:col-span-2">
                <span className="text-muted">Evidence note</span>
                <input
                  className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                  value={rightsNote}
                  onChange={(event) => setRightsNote(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-4 text-xs sm:col-span-2">
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
            </div>
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer">
                License text sent with decision
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/[0.03] p-3 text-[10px] dark:bg-white/[0.03]">
                {licenseText}
              </pre>
            </details>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
                disabled={busy !== null}
                type="button"
                onClick={() =>
                  act("rights", {
                    action: "rights",
                    sourceId: source.id,
                    state: rightsState,
                    evidenceNote: rightsNote,
                    displayAllowed: display,
                    cacheAllowed: cache,
                    redistributeAllowed: redistribute,
                  })
                }
              >
                Record decision
              </button>
              <span className="self-center text-[11px] text-muted">
                Approved needs all three permissions.
              </span>
            </div>
          </>
        ) : null}
      </section>

      <section className="rounded-xl border border-black/10 bg-surface p-5 dark:border-white/10">
        <h2 className="text-sm font-semibold">2 · Import one Pelican record</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-muted">
          The import fetches only a manifest-listed Pelican record and verifies
          the prompt, artifact and thumbnail hashes plus the MIT text. It stores
          the revision for review; it never publishes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[18rem] flex-1 rounded-lg border border-black/10 bg-background px-3 py-2 font-mono text-xs dark:border-white/10"
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
          />
          <button
            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium disabled:opacity-50 dark:border-white/10"
            disabled={busy !== null || !source}
            type="button"
            onClick={() =>
              act("import", { action: "import", resultPath: importPath })
            }
          >
            {busy === "import" ? "Fetching and verifying…" : "Import record"}
          </button>
        </div>
      </section>

      <ShowcaseOpenRouterPanel
        act={act}
        busy={busy}
        rights={rights}
        sources={sources}
      />

      <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
        <table className="data-table">
          <caption className="sr-only">
            Imported visual builds with rights, binding and publication state.
          </caption>
          <thead>
            <tr>
              <th scope="col">Record</th>
              <th scope="col">Source model</th>
              <th scope="col">Binding</th>
              <th scope="col">Visibility</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {builds.length === 0 ? (
              <tr>
                <td className="text-muted" colSpan={5}>
                  No imports yet. Register the source, record a decision, then
                  import a manifest-listed record.
                </td>
              </tr>
            ) : (
              builds.map((build) => (
                <tr key={build.buildId}>
                  <td className="max-w-[22rem]">
                    <p className="truncate font-medium">{build.title}</p>
                    <p className="mono mt-0.5 truncate text-[11px] text-muted">
                      {build.externalId} · {build.revisionId}
                    </p>
                  </td>
                  <td className="text-xs">
                    <p className="mono">{build.originalModelId}</p>
                    <p className="mt-0.5 text-muted">{build.creator}</p>
                  </td>
                  <td className="text-xs">
                    <p>
                      {build.bindingState} · {build.bindingMethod}
                    </p>
                    <p className="mt-0.5 max-w-[20rem] text-muted">
                      {build.modelId || "unbound"}
                      {build.bindingState !== "accepted" ? (
                        <span className="mt-1 flex gap-1">
                          <input
                            aria-label={`Model id for ${build.externalId}`}
                            className="w-full rounded border border-black/10 bg-background px-2 py-1 font-mono text-[10px] dark:border-white/10"
                            placeholder="exact catalog id"
                            value={modelDraft[build.revisionId] ?? ""}
                            onChange={(event) =>
                              setModelDraft((rows) => ({
                                ...rows,
                                [build.revisionId]: event.target.value,
                              }))
                            }
                          />
                          <button
                            className="rounded bg-foreground px-2 py-1 text-[10px] text-background"
                            type="button"
                            onClick={() =>
                              act(`binding-${build.revisionId}`, {
                                action: "binding",
                                decision: "accept",
                                revisionId: build.revisionId,
                                modelId: modelDraft[build.revisionId] ?? "",
                              })
                            }
                          >
                            accept
                          </button>
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 max-w-[22rem] text-[11px] text-muted">
                      {build.bindingReason}
                    </p>
                  </td>
                  <td className="text-xs">
                    <p>{build.visibility}</p>
                    {!build.catalogDigestMatches ? (
                      <p className="mt-0.5 text-warning">catalog changed</p>
                    ) : null}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <button
                        className="rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-medium text-background disabled:opacity-40"
                        disabled={
                          busy !== null ||
                          build.visibility === "published" ||
                          !build.catalogDigestMatches
                        }
                        type="button"
                        onClick={() =>
                          act(`publish-${build.buildId}`, {
                            action: "publish",
                            buildId: build.buildId,
                          })
                        }
                      >
                        Publish
                      </button>
                      <button
                        className="rounded-lg border border-black/10 px-3 py-1.5 text-[11px] font-medium disabled:opacity-40 dark:border-white/10"
                        disabled={
                          busy !== null || build.visibility !== "published"
                        }
                        type="button"
                        onClick={() =>
                          act(`withdraw-${build.buildId}`, {
                            action: "withdraw",
                            buildId: build.buildId,
                            note: "Withdrawn from operator review.",
                          })
                        }
                      >
                        Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
