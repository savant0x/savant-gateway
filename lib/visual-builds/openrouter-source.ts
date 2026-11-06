import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  fetchPublicResponse,
  readBoundedResponseBytes,
} from "../content/transport.ts";

import {
  OPENROUTER_BASE_URL,
  OPENROUTER_REVISION,
  OPENROUTER_SOURCE_ID,
  OpenRouterSourceError,
  parseOpenRouterManifest,
  parseOpenRouterRecord,
  verifyOpenRouterFiles,
  type OpenRouterSnapshot,
} from "./openrouter-record.ts";
import { VISUAL_BUILD_LIMITS, type VisualBuildSource } from "./types.ts";

export type OpenRouterImportInput = {
  record: unknown;
  promptText: string;
  licenseText: string;
};

export async function loadOpenRouterFixture(
  root: string,
  source: VisualBuildSource,
  recordId: string,
): Promise<OpenRouterSnapshot> {
  const manifest = parseOpenRouterManifest(
    await readFile(path.join(root, "manifest.json"), "utf8"),
  );
  const record = manifest.find((entry) => entry.externalId === recordId);

  if (!record) {
    throw new OpenRouterSourceError(
      `The OpenRouter fixture does not list ${recordId}.`,
    );
  }
  if (!record.documentPath) {
    throw new OpenRouterSourceError(
      "The OpenRouter fixture record has no document path.",
    );
  }

  const artifactBytes = await readFile(path.join(root, record.documentPath));
  const thumbnailBytes = record.thumbnailPath
    ? await readFile(path.join(root, record.thumbnailPath))
    : null;
  const promptText = await readFile(path.join(root, "prompt.txt"), "utf8");
  const licenseText = await readFile(path.join(root, "LICENSE"), "utf8");

  return verifyOpenRouterFiles(
    source,
    record,
    promptText,
    artifactBytes,
    thumbnailBytes,
    licenseText,
  );
}

async function fetchBytes(url: string, maxBytes: number, label: string) {
  const { response } = await fetchPublicResponse(url);
  const bytes = await readBoundedResponseBytes(response, maxBytes, label);

  return { response, bytes };
}

export async function fetchOpenRouterSnapshot(
  source: VisualBuildSource,
  input: OpenRouterImportInput,
): Promise<OpenRouterSnapshot> {
  const record = parseOpenRouterRecord(JSON.stringify(input.record));

  if (!input.promptText.trim() || !input.licenseText.trim()) {
    throw new OpenRouterSourceError(
      "The OpenRouter import needs the exact prompt and license text.",
    );
  }

  const document = await fetchBytes(
    record.documentUrl,
    VISUAL_BUILD_LIMITS.htmlBytes,
    "OpenRouter document",
  );

  if (!document.response.ok) {
    throw new OpenRouterSourceError(
      `The OpenRouter document returned HTTP ${document.response.status}.`,
    );
  }

  const thumbnail = await fetchBytes(
    record.thumbnailUrl,
    VISUAL_BUILD_LIMITS.thumbnailBytes,
    "OpenRouter thumbnail",
  );
  const thumbnailBytes =
    thumbnail.response.status === 404 ? null : thumbnail.bytes;

  if (thumbnailBytes && !thumbnail.response.ok) {
    throw new OpenRouterSourceError(
      `The OpenRouter thumbnail returned HTTP ${thumbnail.response.status}.`,
    );
  }

  return verifyOpenRouterFiles(
    source,
    record,
    input.promptText,
    document.bytes,
    thumbnailBytes,
    input.licenseText,
  );
}

export function openRouterFixtureSource(
  overrides: Partial<VisualBuildSource> = {},
): VisualBuildSource {
  return {
    id: OPENROUTER_SOURCE_ID,
    kind: "openrouter_artifacts",
    label: "OpenRouter games",
    baseUrl: OPENROUTER_BASE_URL,
    revision: OPENROUTER_REVISION,
    enabled: true,
    maxStorageBytes: VISUAL_BUILD_LIMITS.storageBytes,
    createdAt: "2026-11-06T00:00:00.000Z",
    updatedAt: "2026-11-06T00:00:00.000Z",
    ...overrides,
  };
}
