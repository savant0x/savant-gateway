import type { Metadata } from "next";
import type {
  ContentKind,
  ContentLinkState,
  ContentRelation,
} from "@/lib/content/types";

import Link from "next/link";

import { ContentLinkActions } from "@/components/admin/content-link-actions";
import { contentDate } from "@/lib/content/format";
import { listLinkInventory } from "@/lib/content/store/link-inventory";
import { CONTENT_KINDS, CONTENT_RELATIONS } from "@/lib/content/types";
import { CONTENT_LINK_STATES } from "@/lib/content/visibility";
import { getDatabase } from "@/lib/storage/runtime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin model links",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Filters = {
  state: string;
  modelId: string;
  sourceId: string;
  kind: string;
  relation: string;
  since: string;
  until: string;
  q: string;
};

function one(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key];

  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function hrefFor(filters: Filters, cursor?: string | null): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }

  if (cursor) params.set("cursor", cursor);

  const query = params.toString();

  return query ? `/admin/content/links?${query}` : "/admin/content/links";
}

export default async function AdminContentLinksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const stateValue = one(params, "state");
  const state = CONTENT_LINK_STATES.includes(stateValue as ContentLinkState)
    ? (stateValue as ContentLinkState)
    : undefined;
  const kindValue = one(params, "kind");
  const kind = CONTENT_KINDS.includes(kindValue as ContentKind)
    ? (kindValue as ContentKind)
    : undefined;
  const relationValue = one(params, "relation");
  const relation = CONTENT_RELATIONS.includes(relationValue as ContentRelation)
    ? (relationValue as ContentRelation)
    : undefined;
  const modelId = one(params, "modelId").trim().slice(0, 200);
  const sourceId = one(params, "sourceId").trim().slice(0, 200);
  const since = one(params, "since").trim().slice(0, 40);
  const until = one(params, "until").trim().slice(0, 40);
  const q = one(params, "q").trim().slice(0, 120);
  const cursor = one(params, "cursor") || undefined;
  const limit = 50;
  const filters: Filters = {
    state: state ?? "",
    modelId,
    sourceId,
    kind: kind ?? "",
    relation: relation ?? "",
    since,
    until,
    q,
  };
  let inventory: Awaited<ReturnType<typeof listLinkInventory>> | null = null;
  let error: string | null = null;

  try {
    const db = await getDatabase();

    inventory = await listLinkInventory(db, {
      state,
      modelId: modelId || undefined,
      sourceId: sourceId || undefined,
      kind,
      relation,
      search: q || undefined,
      since: since || undefined,
      until: until || undefined,
      cursor,
      limit,
    });
  } catch (caught) {
    error =
      caught instanceof Error ? caught.message : "Storage is unavailable.";
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-accent">
            Signal
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em]">
            Model link inventory
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Every stored association, including suggested, dismissed, retired
            and accepted rows. Paging is a stable keyset, so an older accepted
            story stays reachable beyond the recent preview. Decisions are
            revisioned; a stale tab cannot overwrite a newer decision.
          </p>
        </div>
        <Link
          className="rounded-lg border border-black/10 px-3 py-2 text-xs font-medium transition-colors hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          href="/admin/content"
        >
          ← Content sources
        </Link>
      </div>

      {error ? (
        <section className="rounded-xl border border-danger/30 bg-danger/10 p-5">
          <h2 className="text-sm font-semibold text-danger">
            Link storage is unavailable
          </h2>
          <p className="mt-2 font-mono text-xs text-danger">{error}</p>
        </section>
      ) : null}

      {inventory ? (
        <>
          <div className="flex flex-wrap gap-2">
            {CONTENT_LINK_STATES.map((entry) => (
              <span
                key={entry}
                className="rounded-full border border-black/10 px-2.5 py-1 text-[11px] text-muted dark:border-white/10"
              >
                {entry} {inventory.counts[entry]}
              </span>
            ))}
          </div>

          <form
            className="grid gap-2 rounded-xl border border-black/10 bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-white/10"
            method="get"
          >
            <select
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={state ?? ""}
              name="state"
            >
              <option value="">All states</option>
              {CONTENT_LINK_STATES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <input
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={modelId}
              name="modelId"
              placeholder="Exact model id"
            />
            <input
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={sourceId}
              name="sourceId"
              placeholder="Exact source id"
            />
            <input
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={q}
              name="q"
              placeholder="Search item title or model id"
            />
            <select
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={kind ?? ""}
              name="kind"
            >
              <option value="">All content kinds</option>
              {CONTENT_KINDS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
              defaultValue={relation ?? ""}
              name="relation"
            >
              <option value="">All relations</option>
              {CONTENT_RELATIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
            <label className="text-[11px] text-muted">
              Published since
              <input
                className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                defaultValue={since}
                name="since"
                type="date"
              />
            </label>
            <label className="text-[11px] text-muted">
              Published before
              <input
                className="mt-1 w-full rounded-lg border border-black/10 bg-background px-3 py-2 text-sm dark:border-white/10"
                defaultValue={until}
                name="until"
                type="date"
              />
            </label>
            <button
              className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
              type="submit"
            >
              Filter
            </button>
            <Link
              className="rounded-lg border border-black/10 px-3 py-2 text-center text-sm dark:border-white/10"
              href="/admin/content/links"
            >
              Clear
            </Link>
          </form>

          <section className="scroll-shell rounded-xl border border-black/10 dark:border-white/10">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Model</th>
                  <th>Source / kind</th>
                  <th>Relation</th>
                  <th>State</th>
                  <th>Revision</th>
                  <th>Created</th>
                  <th>Why</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {inventory.links.length === 0 ? (
                  <tr>
                    <td className="text-muted" colSpan={9}>
                      No model link matches these filters.
                    </td>
                  </tr>
                ) : (
                  inventory.links.map((link) => (
                    <tr key={`${link.itemId}:${link.modelId}`}>
                      <td className="max-w-[20rem] truncate">
                        <Link
                          className="text-accent hover:underline"
                          href={`/signal/${encodeURIComponent(link.itemId)}`}
                        >
                          {link.itemTitle}
                        </Link>
                      </td>
                      <td className="mono max-w-[14rem] truncate text-xs">
                        <Link
                          className="text-accent hover:underline"
                          href={`/models/${encodeURIComponent(link.modelId)}`}
                        >
                          {link.modelId}
                        </Link>
                      </td>
                      <td className="text-xs text-muted">
                        {link.sourceLabel} · {link.kind}
                      </td>
                      <td>{link.relation}</td>
                      <td>{link.state}</td>
                      <td className="mono text-xs">{link.revision}</td>
                      <td className="text-xs text-muted">
                        {contentDate(link.createdAt)}
                      </td>
                      <td className="max-w-[18rem] text-xs text-muted">
                        {link.reason}
                      </td>
                      <td>
                        <ContentLinkActions
                          itemId={link.itemId}
                          modelId={link.modelId}
                          revision={link.revision}
                          state={link.state}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{inventory.total} association(s)</span>
            <div className="flex gap-2">
              <Link
                className="rounded-lg border border-black/10 px-3 py-1.5 dark:border-white/10"
                href={hrefFor(filters)}
              >
                First page
              </Link>
              {inventory.nextCursor ? (
                <Link
                  className="rounded-lg border border-black/10 px-3 py-1.5 dark:border-white/10"
                  href={hrefFor(filters, inventory.nextCursor)}
                >
                  Next →
                </Link>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
