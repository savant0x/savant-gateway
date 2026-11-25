// Read-only probe: run the shipped catalog normalizer over a captured upstream
// /models payload and report what the importer would do with it. Used as the
// evidence path for docs/research/inferhub-upstream-audit.md; it writes nothing.
import { readFileSync } from "node:fs";

import { canonicalModelKey } from "../lib/model-identity.ts";
import { normalizeCatalog } from "../lib/providers/normalize/index.ts";

const file = process.argv[2];

if (!file) {
  console.error("usage: node scripts/upstream-catalog-probe.mjs <models.json>");
  process.exit(2);
}

const payload = JSON.parse(readFileSync(file, "utf8"));
const rows = Array.isArray(payload) ? payload : payload?.data;

if (!Array.isArray(rows)) {
  console.error("The payload has no model array; nothing to probe.");
  process.exit(2);
}

// The probe runs the shipped importer, so it refuses what a sync refuses:
// `free/` rows, alias ids and non-text output.
const result = normalizeCatalog(rows, new Map());

const prices = result.models
  .filter((model) => model.inputPer1M !== null && model.outputPer1M !== null)
  .map((model) => model);

const groups = new Map();

for (const model of result.models) {
  const key = canonicalModelKey(model.upstreamId);

  groups.set(key, (groups.get(key) ?? 0) + 1);
}

const collisions = [...groups.entries()]
  .filter(([, count]) => count > 1)
  .sort((left, right) => right[1] - left[1]);

const families = new Map();

for (const model of result.models) {
  families.set(model.family, (families.get(model.family) ?? 0) + 1);
}

console.log(
  JSON.stringify(
    {
      received: rows.length,
      imported: result.models.length,
      skippedAliases: result.skippedAliases.length,
      skippedMedia: result.skippedMedia.length,
      skippedFreePool: result.skippedFreePool.length,
      priced: prices.length,
      vision: result.models.filter((model) => model.supportsVision).length,
      routeGroups: groups.size,
      collidingGroups: collisions.length,
      worstCollisions: collisions.slice(0, 8),
      families: [...families.entries()].sort((left, right) => right[1] - left[1]),
      mediaSamples: result.skippedMedia.slice(0, 6),
      importSamples: result.models.slice(0, 6).map((model) => ({
        id: model.upstreamId,
        family: model.family,
        inputPer1M: model.inputPer1M,
        outputPer1M: model.outputPer1M,
      })),
    },
    null,
    1,
  ),
);
