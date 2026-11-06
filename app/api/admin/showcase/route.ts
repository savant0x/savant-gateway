import { randomUUID } from "node:crypto";

import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import {
  acceptShowcaseBinding,
  finishShowcaseImport,
  claimShowcaseImport,
  getAdminShowcaseBuild,
  listAdminShowcaseBuilds,
  listShowcaseRights,
  listShowcaseSources,
  persistShowcaseSnapshot,
  appendShowcaseRights,
  publishShowcaseBuild,
  rejectShowcaseBinding,
  upsertShowcaseSource,
  withdrawShowcaseBuild,
} from "@/lib/store";
import {
  PELICAN_BASE_URL,
  PELICAN_COMMIT,
  PELICAN_LICENSE_TEXT,
  PELICAN_RESULT_PATH,
  PELICAN_SOURCE_ID,
  fetchPelicanSnapshot,
  pelicanFixtureSource,
} from "@/lib/visual-builds/pelican";
import { sha256Hex, visualBuildsEnabled } from "@/lib/visual-builds/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function stringField(body: Record<string, unknown>, name: string): string {
  return typeof body[name] === "string" ? body[name].trim() : "";
}

function booleanField(body: Record<string, unknown>, name: string): boolean {
  return body[name] === true;
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;
  if (!visualBuildsEnabled()) {
    return adminError(404, "Visual builds are disabled.");
  }

  const sources = await listShowcaseSources();
  const rights = await Promise.all(
    sources.map((source) => listShowcaseRights(source.id, 8)),
  );

  return Response.json(
    {
      sources,
      rights,
      builds: await listAdminShowcaseBuilds(50),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;
  if (!visualBuildsEnabled()) {
    return adminError(404, "Visual builds are disabled.");
  }

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const action = stringField(body, "action");
  const reviewer = stringField(body, "reviewer") || "operator";

  try {
    if (action === "source") {
      const source = pelicanFixtureSource();

      return Response.json(
        {
          source: await upsertShowcaseSource({
            id: source.id,
            label: source.label,
            baseUrl: PELICAN_BASE_URL,
            revision: PELICAN_COMMIT,
            enabled: true,
            maxStorageBytes: source.maxStorageBytes,
          }),
        },
        { headers: NO_STORE },
      );
    }

    if (action === "rights") {
      const state = stringField(body, "state");

      if (
        state !== "pending" &&
        state !== "approved" &&
        state !== "withdrawn"
      ) {
        return adminError(400, "state must be pending, approved or withdrawn.");
      }

      const licenseText =
        stringField(body, "licenseText") || PELICAN_LICENSE_TEXT;
      const licenseSha =
        stringField(body, "licenseSha256") || sha256Hex(licenseText);
      const evidenceNote =
        stringField(body, "evidenceNote") ||
        "Pinned Pelican repository and license reviewed by the operator.";

      return Response.json(
        {
          rights: await appendShowcaseRights({
            sourceId: PELICAN_SOURCE_ID,
            state,
            evidenceUrl:
              stringField(body, "evidenceUrl") ||
              `https://github.com/AzatJalilov/PelicanSdf/tree/${PELICAN_COMMIT}`,
            evidenceNote,
            evidenceSha256:
              stringField(body, "evidenceSha256") ||
              sha256Hex(`${PELICAN_COMMIT}\0${evidenceNote}`),
            licenseText,
            licenseSha256: licenseSha,
            attribution:
              stringField(body, "attribution") || "Pelican SDF contributors",
            displayAllowed: booleanField(body, "displayAllowed"),
            cacheAllowed: booleanField(body, "cacheAllowed"),
            redistributeAllowed: booleanField(body, "redistributeAllowed"),
            reviewer,
            reviewedAt: new Date().toISOString(),
          }),
        },
        { status: 201, headers: NO_STORE },
      );
    }

    if (action === "import") {
      const source = (await listShowcaseSources()).find(
        (row) => row.id === PELICAN_SOURCE_ID,
      );

      if (!source) return adminError(400, "Register the source first.");
      if (!source.enabled) return adminError(400, "The source is disabled.");

      const resultPath = stringField(body, "resultPath") || PELICAN_RESULT_PATH;
      const ownerToken = `admin:${randomUUID()}`;
      const lease = await claimShowcaseImport(source.id, ownerToken);

      if (!lease.claimed) {
        return adminError(409, "An import is already running.");
      }

      try {
        const snapshot = await fetchPelicanSnapshot(source, resultPath);
        const result = await persistShowcaseSnapshot(source.id, snapshot);

        await finishShowcaseImport({
          runId: lease.id,
          ownerToken,
          status: "ok",
          seen: 1,
          imported: 1,
          skipped: 0,
          error: null,
        });

        return Response.json({ result }, { headers: NO_STORE });
      } catch (error) {
        await finishShowcaseImport({
          runId: lease.id,
          ownerToken,
          status: "failed",
          seen: 0,
          imported: 0,
          skipped: 0,
          error: error instanceof Error ? error.message : "Import failed.",
        });

        throw error;
      }
    }

    if (action === "binding") {
      const revisionId = stringField(body, "revisionId");
      const decision = stringField(body, "decision");

      if (!revisionId) return adminError(400, "A revision is required.");

      if (decision === "accept") {
        const result = await acceptShowcaseBinding({
          revisionId,
          modelId: stringField(body, "modelId"),
          reviewer,
          note: stringField(body, "note"),
        });

        return result.ok
          ? Response.json({ ok: true }, { headers: NO_STORE })
          : adminError(400, `Binding refused: ${result.code}.`);
      }

      if (decision === "reject") {
        return (await rejectShowcaseBinding(
          revisionId,
          reviewer,
          stringField(body, "note"),
        ))
          ? Response.json({ ok: true }, { headers: NO_STORE })
          : adminError(404, "Binding not found.");
      }

      return adminError(400, "decision must be accept or reject.");
    }

    const buildId = stringField(body, "buildId");

    if (!buildId) return adminError(400, "A build is required.");

    if (action === "publish") {
      const result = await publishShowcaseBuild({
        buildId,
        reviewer,
        note: stringField(body, "note"),
      });

      return result.ok
        ? Response.json(result, { headers: NO_STORE })
        : adminError(result.code === "not_found" ? 404 : 409, result.reason);
    }

    if (action === "withdraw") {
      return (await withdrawShowcaseBuild({
        buildId,
        reviewer,
        note: stringField(body, "note"),
      }))
        ? Response.json({ ok: true }, { headers: NO_STORE })
        : adminError(404, "Build not found.");
    }

    if (action === "build") {
      const build = await getAdminShowcaseBuild(buildId);

      return build
        ? Response.json({ build }, { headers: NO_STORE })
        : adminError(404, "Build not found.");
    }

    return adminError(400, "Unknown action.");
  } catch (error) {
    return adminError(
      400,
      error instanceof Error ? error.message : "The showcase action failed.",
    );
  }
}
