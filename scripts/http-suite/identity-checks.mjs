import { check, checkEqual, request } from "./harness.mjs";
import { idNamespaceProblem, slugContexts, slugHits } from "./identity.mjs";

/**
 * The rendered-surface gate for supplier identity (FID-2026-1125-002).
 *
 * Two records in a row fixed a leak by changing a component and shipped with
 * nothing that read a page, so the next surface added the name back. These
 * checks read what a customer receives: the public pages, the published model
 * list and a model page, against the provider rows this database actually holds.
 */

/** Pages a customer can open without a session. */
const PAGES = ["/", "/models", "/compare", "/docs", "/docs/faq", "/plans"];

/**
 * The provider slugs that must never be readable, and the words that are names
 * of a model rather than of its supplier.
 *
 * A slug equal to a published `family` (or model name) is the model's own
 * identity: the catalog prints "DeepSeek" because that is the model line, not
 * because it names the account that serves it. Any other occurrence is the leak
 * this gate exists for.
 */
async function upstreamSlugs(db) {
  const providers = await db
    .prepare(
      `SELECT slug FROM providers
        WHERE enabled = 1 AND COALESCE(is_default, 0) = 0`,
    )
    .all();
  const named = await db
    .prepare(
      `SELECT DISTINCT name, family FROM models
        WHERE status = 'active' AND in_catalog = 1`,
    )
    .all();
  const own = new Set();

  for (const row of named) {
    for (const value of [row.name, row.family]) {
      if (value) own.add(String(value).trim().toLowerCase());
    }
  }

  return providers
    .map((row) => row.slug)
    .filter((slug) => slug && !own.has(String(slug).toLowerCase()));
}

/** The model links a page offers, as the first path segment after `/models/`. */
function modelLinkSegments(html) {
  const segments = new Set();

  for (const match of html.matchAll(/\/models\/([^"'\s<>\\)]+)/g)) {
    const first = decodeURIComponent(match[1].split("/")[0] ?? "");

    if (first) segments.add(first);
  }

  return segments;
}

export async function runPublicIdentityChecks(context, key) {
  const slugs = await upstreamSlugs(context.db);

  check(
    "identity reads the provider rows it must keep quiet",
    Array.isArray(slugs),
    "provider query returned no array",
  );

  for (const page of PAGES) {
    const response = await request(context.baseUrl, page);

    checkEqual(`identity ${page} serves`, response.status, 200);

    const hits = slugHits(response.text, slugs);

    check(
      `identity ${page} names no upstream provider`,
      hits.length === 0,
      slugContexts(response.text, hits).join(" | "),
    );

    const links = modelLinkSegments(response.text);
    const leaky = slugs.filter((slug) => links.has(slug));

    check(
      `identity ${page} links no model by a provider slug`,
      leaky.length === 0,
      `found /models/${leaky.join(" and /models/")}`,
    );
  }

  const list = await request(context.baseUrl, "/v1/models", {
    headers: { authorization: `Bearer ${key.secret}` },
  });

  checkEqual("identity /v1/models serves", list.status, 200);

  const published = list.json?.data ?? [];

  check("identity /v1/models publishes models", published.length > 0);

  for (const model of published) {
    const problem = idNamespaceProblem(model.id);

    check(
      `identity published id ${model.id} carries no provider namespace`,
      problem === null,
      problem ?? "",
    );

    check(
      `identity published id ${model.id} is not the stored key`,
      !slugs.some((slug) => String(model.id).startsWith(`${slug}/`)),
      String(model.id),
    );
  }

  // A published id is what a client copies into a request body and into a URL,
  // so the gateway must answer to it. The fixture's ids are unscoped, which is
  // why the stored-key precedence is proven in `tests/public-model-identity.test.mjs`
  // rather than here.
  for (const model of published.slice(0, 3)) {
    const path = model.id.split("/").map(encodeURIComponent).join("/");
    const retrieve = await request(context.baseUrl, `/v1/models/${path}`, {
      headers: { authorization: `Bearer ${key.secret}` },
    });

    checkEqual(
      `identity published id ${model.id} retrieves`,
      retrieve.status,
      200,
    );
    checkEqual(
      `identity published id ${model.id} retrieves itself`,
      retrieve.json?.id,
      model.id,
    );

    const page = await request(context.baseUrl, `/models/${path}`);

    checkEqual(
      `identity published id ${model.id} has a model page`,
      page.status,
      200,
    );
  }
}
