import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  fetchPublicResponse,
  readBoundedResponseBytes,
} from "../content/transport.ts";

import { VISUAL_BUILD_LIMITS, type VisualBuildSource } from "./types.ts";
import {
  PELICAN_BASE_URL,
  PELICAN_COMMIT,
  PELICAN_SOURCE_ID,
  PelicanSourceError,
  parsePelicanManifest,
  parsePelicanResult,
  verifyPelicanFiles,
  type PelicanSnapshot,
} from "./pelican-record.ts";

/** Local-fixture and pinned-network loaders for the Pelican source. */

async function optionalFixtureFile(file: string): Promise<Uint8Array | null> {
  try {
    return await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;

    throw error;
  }
}

/**
 * Loads one pinned record from a local fixture directory. Tests and operator
 * imports use this path; it performs no network access.
 */
export async function loadPelicanFixture(
  root: string,
  source: VisualBuildSource,
  resultPath: string,
): Promise<PelicanSnapshot> {
  const manifestPath = path.join(root, "manifest.json");
  const manifest = parsePelicanManifest(await readFile(manifestPath, "utf8"));

  if (!manifest.includes(resultPath)) {
    throw new PelicanSourceError(
      `Pelican manifest does not list ${resultPath}.`,
    );
  }

  const rawResult = await readFile(path.join(root, resultPath), "utf8");
  const prompt = await readFile(path.join(root, "prompt.txt"), "utf8");
  const license = await readFile(path.join(root, "LICENSE"), "utf8");
  const provisional = parsePelicanResult(rawResult, resultPath);
  const artifact = await readFile(path.join(root, provisional.artifactPath));
  const thumbnail = await optionalFixtureFile(
    path.join(root, "thumbnails", `${provisional.externalId}.jpg`),
  );
  const files = verifyPelicanFiles(
    source,
    resultPath,
    rawResult,
    prompt,
    artifact,
    thumbnail,
    license,
  );

  return {
    source,
    manifestPath,
    resultPath,
    ...files,
    promptSha256: files.record.promptSha256,
  };
}

function sourceUrl(baseUrl: string, relativePath: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  return new URL(relativePath, base).toString();
}

async function fetchBytes(url: string, maxBytes: number, label: string) {
  const { response } = await fetchPublicResponse(url);
  const bytes = await readBoundedResponseBytes(response, maxBytes, label);

  return { response, bytes };
}

async function fetchText(url: string, maxBytes: number, label: string) {
  const { response, bytes } = await fetchBytes(url, maxBytes, label);

  return { response, text: new TextDecoder().decode(bytes) };
}

/**
 * Fetches the manifest, one record, the canonical prompt and both assets from
 * an operator-pinned source revision. Every request goes through the existing
 * public-URL, redirect and byte-ceiling transport.
 */
export async function fetchPelicanSnapshot(
  source: VisualBuildSource,
  resultPath: string,
): Promise<PelicanSnapshot> {
  const manifestResponse = await fetchText(
    sourceUrl(source.baseUrl, "data/manifest.json"),
    VISUAL_BUILD_LIMITS.manifestBytes,
    "Pelican manifest",
  );

  if (!manifestResponse.response.ok) {
    throw new PelicanSourceError(
      `Pelican manifest returned HTTP ${manifestResponse.response.status}.`,
    );
  }

  const manifest = parsePelicanManifest(manifestResponse.text);

  if (!manifest.includes(resultPath)) {
    throw new PelicanSourceError(
      `Pelican manifest does not list ${resultPath}.`,
    );
  }

  const resultResponse = await fetchText(
    sourceUrl(source.baseUrl, `data/${resultPath}`),
    VISUAL_BUILD_LIMITS.resultBytes,
    "Pelican result",
  );

  if (!resultResponse.response.ok) {
    throw new PelicanSourceError(
      `Pelican result returned HTTP ${resultResponse.response.status}.`,
    );
  }

  const provisional = parsePelicanResult(resultResponse.text, resultPath);
  const promptResponse = await fetchText(
    sourceUrl(source.baseUrl, "benchmark/prompt.txt"),
    VISUAL_BUILD_LIMITS.promptBytes,
    "Pelican prompt",
  );
  const licenseResponse = await fetchText(
    sourceUrl(source.baseUrl, "LICENSE"),
    VISUAL_BUILD_LIMITS.licenseBytes,
    "Pelican license",
  );
  const artifactResponse = await fetchBytes(
    sourceUrl(source.baseUrl, `data/${provisional.artifactPath}`),
    VISUAL_BUILD_LIMITS.artifactBytes,
    "Pelican artifact",
  );

  if (!artifactResponse.response.ok) {
    throw new PelicanSourceError(
      `Pelican artifact returned HTTP ${artifactResponse.response.status}.`,
    );
  }

  const thumbnailResponse = await fetchBytes(
    sourceUrl(
      source.baseUrl,
      `assets/thumbnails/${provisional.externalId}.jpg`,
    ),
    VISUAL_BUILD_LIMITS.thumbnailBytes,
    "Pelican thumbnail",
  );
  const thumbnail =
    thumbnailResponse.response.status === 404 ? null : thumbnailResponse.bytes;

  if (thumbnail && !thumbnailResponse.response.ok) {
    throw new PelicanSourceError(
      `Pelican thumbnail returned HTTP ${thumbnailResponse.response.status}.`,
    );
  }

  const files = verifyPelicanFiles(
    source,
    resultPath,
    resultResponse.text,
    promptResponse.text,
    artifactResponse.bytes,
    thumbnail,
    licenseResponse.text,
  );

  return {
    source,
    manifestPath: "data/manifest.json",
    resultPath,
    ...files,
    promptSha256: files.record.promptSha256,
  };
}

export function pelicanFixtureSource(
  overrides: Partial<VisualBuildSource> = {},
): VisualBuildSource {
  return {
    id: PELICAN_SOURCE_ID,
    kind: "pelican_sdf",
    label: "Pelican SDF",
    baseUrl: PELICAN_BASE_URL,
    revision: PELICAN_COMMIT,
    enabled: true,
    maxStorageBytes: VISUAL_BUILD_LIMITS.storageBytes,
    createdAt: "2026-11-05T00:00:00.000Z",
    updatedAt: "2026-11-05T00:00:00.000Z",
    ...overrides,
  };
}
