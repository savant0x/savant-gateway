import assert from "node:assert/strict";
import test from "node:test";

import { createStorageDatabase } from "../lib/storage/database.ts";
import {
  claimRun,
  confirmMismatch,
  countSamples,
  ensureProtocol,
  getPublishedVerdict,
  getRun,
  getVerdict,
  insertReference,
  insertRun,
  insertSample,
  listCorrections,
  publishVerdict,
  selectReference,
  setRunStatus,
  unpublishVerdict,
  upsertVerdict,
} from "../lib/identity/store.ts";
import { createPgliteDatabase } from "./pglite-pool.mjs";

const T0 = "2026-11-01T12:00:00.000Z";
const T1 = "2026-11-01T12:05:00.000Z";
const T2 = "2026-11-20T12:00:00.000Z";

async function fixture() {
  const { pool } = await createPgliteDatabase();
  const db = await createStorageDatabase({ env: {}, pool });

  return db;
}

const provider = {
  slug: "savant",
  kind: "openai",
  baseUrl: "https://example.test",
  keyEnvVar: "PROVIDER_KEY",
};

function target(modelId = "free/model-a") {
  return {
    modelId,
    name: `Model ${modelId}`,
    canonicalKey: modelId.replace("free/", ""),
    providerSlug: "savant",
    upstreamId: modelId.replace("free/", ""),
    protocol: "chat",
    family: "Test",
    contextWindow: "8k",
    access: "free",
    supportsTools: false,
    costInputMicros: 0,
    costOutputMicros: 0,
    tokenWeight: 1,
  };
}

function estimate() {
  return {
    requests: 1,
    promptTokens: 1,
    completionTokens: 1,
    costMicros: 0,
    weightedTokens: 2,
    minutes: 0.1,
    quotaRemaining: null,
    quotaCheck: "unknown",
    effectiveMode: "baseline",
    refusals: [],
  };
}

function runInput(protocolId, modelId = "free/model-a", now = T0) {
  return {
    protocolId,
    target: target(modelId),
    provider,
    control: null,
    mode: "baseline",
    referenceId: null,
    estimate: estimate(),
    now,
  };
}

function counts(answer = "Paris") {
  return {
    cells: {
      "fp-capital": { n: 20, counts: { [answer]: 20 } },
    },
  };
}

test("the migration creates all seven identity tables", async () => {
  const db = await fixture();

  try {
    const rows = await db
      .prepare(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'identity' ORDER BY table_name`,
      )
      .all();

    assert.deepEqual(
      rows.map((row) => row.table_name),
      [
        "corrections",
        "findings",
        "protocols",
        "references",
        "runs",
        "samples",
        "verdicts",
      ],
    );
  } finally {
    await db.close();
  }
});

test("the protocol seals once and a second ensure does not replace it", async () => {
  const db = await fixture();

  try {
    const first = await ensureProtocol(db, T0);
    const second = await ensureProtocol(db, T1);

    assert.equal(first.id, second.id);
    assert.equal(first.probeSha256, second.probeSha256);
    assert.equal(first.sealedAt, T0);

    const row = await db
      .prepare("SELECT COUNT(*)::int AS total FROM identity.protocols")
      .get();

    assert.equal(row.total, 1);
  } finally {
    await db.close();
  }
});

test("a run needs a protocol row; one active run per target; a completed run frees it", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);

    await assert.rejects(insertRun(db, runInput("missing")));

    const first = await insertRun(db, runInput(protocol.id));

    assert.equal(first.status, "queued");
    await assert.rejects(insertRun(db, runInput(protocol.id)));

    assert.equal(await claimRun(db, first.id, T1), true);
    assert.equal(await claimRun(db, first.id, T1), false);

    await setRunStatus(db, first.id, "completed", { completedAt: T1 });

    const second = await insertRun(db, runInput(protocol.id, "free/model-a", T1));

    assert.notEqual(second.id, first.id);
    assert.equal((await getRun(db, second.id)).status, "queued");
  } finally {
    await db.close();
  }
});

test("duplicate sample ids are ignored and counted once", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);
    const run = await insertRun(db, runInput(protocol.id));
    const sample = {
      id: `${run.id}:fingerprint:fp-capital:target:0`,
      runId: run.id,
      probeId: "fingerprint:fp-capital",
      arm: "target",
      iteration: 0,
      httpStatus: 200,
      modelField: "model-a",
      promptTokens: 12,
      completionTokens: 1,
      responseSha256: "hash",
      responseExcerpt: "Paris",
      topLogprobsJson: null,
      latencyMs: 10,
      errorClass: null,
      createdAt: T0,
    };

    await insertSample(db, sample);
    await insertSample(db, sample);

    assert.deepEqual(await countSamples(db, run.id), {
      target: 1,
      diffControl: 0,
    });
  } finally {
    await db.close();
  }
});

test("reference selection ignores expired rows, rejects a tampered hash, and prefers another provider", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);
    const expired = await insertReference(db, {
      canonicalModelKey: "model-a",
      protocolId: protocol.id,
      providerSlug: "savant",
      upstreamId: "model-a",
      collectedAt: T0,
      expiresAt: "2026-11-01T00:00:00.000Z",
      counts: counts(),
      runId: null,
    });

    assert.equal(
      await selectReference(db, {
        canonicalModelKey: "model-a",
        protocolId: protocol.id,
        now: T1,
      }),
      null,
    );

    const first = await insertReference(db, {
      canonicalModelKey: "model-a",
      protocolId: protocol.id,
      providerSlug: "savant",
      upstreamId: "model-a",
      collectedAt: T0,
      expiresAt: T2,
      counts: counts(),
      runId: null,
    });
    const second = await insertReference(db, {
      canonicalModelKey: "model-a",
      protocolId: protocol.id,
      providerSlug: "other",
      upstreamId: "model-a",
      collectedAt: T1,
      expiresAt: T2,
      counts: counts(),
      runId: null,
    });

    assert.equal(
      (await selectReference(db, {
        canonicalModelKey: "model-a",
        protocolId: protocol.id,
        now: T1,
      })).id,
      second.id,
    );

    assert.equal(
      (
        await selectReference(db, {
          canonicalModelKey: "model-a",
          protocolId: protocol.id,
          now: T1,
          preferDifferentFrom: "savant",
        })
      ).id,
      second.id,
    );

    await db
      .prepare("UPDATE identity.references SET content_sha256 = 'tampered' WHERE id = ?")
      .run(second.id);

    assert.equal(
      (await selectReference(db, {
        canonicalModelKey: "model-a",
        protocolId: protocol.id,
        now: T1,
      })).id,
      first.id,
      "a tampered reference is skipped, not returned",
    );

    assert.notEqual(expired.id, first.id);
  } finally {
    await db.close();
  }
});

test("publish, unpublish, and confirm write corrections and never publish a confirmation", async () => {
  const db = await fixture();

  try {
    const protocol = await ensureProtocol(db, T0);
    const run = await insertRun(db, runInput(protocol.id));

    await setRunStatus(db, run.id, "completed", { completedAt: T1 });

    await upsertVerdict(db, {
      runId: run.id,
      targetModelId: run.targetModelId,
      status: "consistent",
      summary: "Consistent.",
      claims: ["claim"],
      limits: ["limit"],
      coverage: {},
      testedAt: T0,
      validUntil: T2,
      now: T1,
    });

    assert.equal(await publishVerdict(db, run.id, T1), true);
    const published = await getPublishedVerdict(db, run.targetModelId);

    assert.ok(published);
    assert.equal(published.verdict.runId, run.id);

    assert.equal(await unpublishVerdict(db, run.id, T1, "operator note"), true);
    assert.equal(await getPublishedVerdict(db, run.targetModelId), null);

    const corrections = await listCorrections(db);

    assert.deepEqual(
      corrections.map((row) => row.reason).sort(),
      ["published", "unpublished"],
    );

    const second = await insertRun(db, runInput(protocol.id, "free/model-b", T1));

    await setRunStatus(db, second.id, "completed", { completedAt: T1 });

    await upsertVerdict(db, {
      runId: second.id,
      targetModelId: second.targetModelId,
      status: "divergent_review",
      summary: "Under review.",
      claims: [],
      limits: [],
      coverage: {},
      testedAt: T0,
      validUntil: T2,
      now: T1,
    });

    assert.equal(await confirmMismatch(db, second.id, T1, "confirmed"), true);
    assert.equal(await confirmMismatch(db, second.id, T1, "again"), false);
    assert.equal((await getVerdict(db, second.id)).status, "mismatch_confirmed");
    assert.equal((await getVerdict(db, second.id)).published, 0);
    assert.equal(await getPublishedVerdict(db, second.targetModelId), null);
  } finally {
    await db.close();
  }
});
