import assert from "node:assert/strict";
import test from "node:test";

import {
  containsProhibitedPublicWord,
  findingLabel,
  publishedView,
  statusLabel,
  verdictSummary,
} from "../lib/identity/view.ts";
import { decideVerdict } from "../lib/identity/verdict.ts";
import {
  applyPublicationTtl,
  publicIdentityView,
} from "../lib/identity/public-view.ts";

const NOW = "2026-11-01T12:00:00.000Z";

function gate(state = "pass", n = 1, note = null) {
  return { state, n, note };
}

function coverage(overrides = {}) {
  return {
    shape: gate(),
    determinism: gate(),
    fingerprint: {
      state: "inconclusive",
      comparableCells: 0,
      meanJsd: null,
      noise: null,
      lower: null,
      upper: null,
      referenceProvider: null,
      controlPresent: false,
      controlDiscriminative: false,
      controlMeanJsd: null,
    },
    canary: gate(),
    deterministic: gate(),
    context: { ...gate(), testedDepth: null },
    tools: gate(),
    stream: gate(),
    logprobs: gate(),
    ...overrides,
  };
}

function decision(overrides = {}, input = {}) {
  return decideVerdict({
    mode: "verify",
    collectedBaseline: false,
    coverage: coverage(overrides),
    testedAt: NOW,
    ...input,
  });
}

test("the ladder starts at baseline or unsupported without a reference", () => {
  const baseline = decision({}, { collectedBaseline: true });
  const unsupported = decision({}, { collectedBaseline: false });

  assert.equal(baseline.status, "baseline");
  assert.match(baseline.summary, /baseline was collected/i);
  assert.equal(baseline.claims.length, 1);
  assert.equal(baseline.limits.length, 2);

  assert.equal(unsupported.status, "unsupported");
  assert.deepEqual(unsupported.claims, []);
});

test("a failed shape stops the ladder with an error verdict", () => {
  const result = decision(
    {
      shape: gate("fail"),
      fingerprint: {
        ...coverage().fingerprint,
        state: "consistent",
        comparableCells: 6,
        referenceProvider: "second",
        controlPresent: true,
        controlDiscriminative: true,
      },
    },
    { collectedBaseline: true },
  );

  assert.equal(result.status, "error");
});

test("an unstable route is inconclusive even when the fingerprint diverges", () => {
  const result = decision(
    {
      determinism: gate("fail"),
      fingerprint: {
        ...coverage().fingerprint,
        state: "divergent",
        comparableCells: 6,
        referenceProvider: "same",
      },
    },
    { collectedBaseline: false },
  );

  assert.equal(result.status, "inconclusive");
  assert.match(result.summary, /route was unstable/);
});

test("a divergent fingerprint goes to operator review, not a finding", () => {
  const result = decision(
    {
      fingerprint: {
        ...coverage().fingerprint,
        state: "divergent",
        comparableCells: 6,
        referenceProvider: "same",
      },
    },
    { collectedBaseline: false },
  );

  assert.equal(result.status, "divergent_review");
  assert.match(result.summary, /under operator review/);
  assert.equal(result.limits.length, 2);
});

test("too few comparable cells is inconclusive with that reason", () => {
  const result = decision(
    {
      fingerprint: {
        ...coverage().fingerprint,
        state: "inconclusive",
        comparableCells: 3,
        referenceProvider: "same",
      },
    },
    { collectedBaseline: false },
  );

  assert.equal(result.status, "inconclusive");
  assert.match(result.summary, /fewer than four probe cells/);
});

test("a same-provider reference can only reach self-consistent", () => {
  const result = decision(
    {
      fingerprint: {
        ...coverage().fingerprint,
        state: "consistent",
        comparableCells: 6,
        referenceProvider: "same",
      },
    },
    { collectedBaseline: false },
  );

  assert.equal(result.status, "self_consistent");
  assert.match(result.summary, /stable against its own stored baseline/);
});

test("a second-provider reference needs a present, discriminative control", () => {
  const consistent = {
    ...coverage().fingerprint,
    state: "consistent",
    comparableCells: 6,
    referenceProvider: "second",
  };
  const missing = decision(
    { fingerprint: consistent },
    { collectedBaseline: false },
  );
  const flat = decision(
    {
      fingerprint: {
        ...consistent,
        controlPresent: true,
        controlDiscriminative: false,
      },
    },
    { collectedBaseline: false },
  );
  const pass = decision(
    {
      fingerprint: {
        ...consistent,
        controlPresent: true,
        controlDiscriminative: true,
      },
    },
    { collectedBaseline: false },
  );

  assert.equal(missing.status, "inconclusive");
  assert.match(missing.summary, /control was missing/);
  assert.equal(flat.status, "inconclusive");
  assert.match(flat.summary, /control did not separate/);
  assert.equal(pass.status, "consistent");
  assert.equal(pass.claims.length, 2);
});

test("every status summary avoids the prohibited public words", () => {
  for (const status of [
    "baseline",
    "self_consistent",
    "consistent",
    "inconclusive",
    "divergent_review",
    "mismatch_confirmed",
    "unsupported",
    "stale",
    "error",
  ]) {
    assert.ok(statusLabel(status).length > 0);
    assert.equal(
      containsProhibitedPublicWord(verdictSummary(status)),
      false,
      `${status} summary uses prohibited copy`,
    );
  }

  assert.equal(containsProhibitedPublicWord("Authentic weights"), true);
  assert.equal(containsProhibitedPublicWord("advisory result"), false);
});

test("publishedView renders finding copy without leaking internals", () => {
  const verdict = {
    id: "v1",
    runId: "r1",
    targetModelId: "free/model-a",
    status: "consistent",
    summary: verdictSummary("consistent", { date: "2026-11-01", n: 6 }),
    claimsJson: '["claim one"]',
    limitsJson: '["limit one"]',
    coverageJson: "{}",
    testedAt: NOW,
    validUntil: "2026-11-08T12:00:00.000Z",
    published: 1,
    publishedAt: NOW,
    publishedBy: "operator",
    createdAt: NOW,
  };
  const finding = (className, state, n, evidence = {}) => ({
    id: `${className}-${state}`,
    runId: "r1",
    class: className,
    metric: "metric",
    observed: null,
    threshold: null,
    n,
    state,
    evidenceJson: JSON.stringify(evidence),
    createdAt: NOW,
  });
  const view = publishedView({
    verdict,
    findings: [
      finding("canary", "fail", 6),
      finding("context", "pass", 6, {
        testedDepth: 8_192,
        advertised: "128K",
      }),
      finding("tools", "pass", 6),
      finding("stream", "fail", 3),
      finding("determinism", "pass", 18),
      finding("deterministic", "pass", 20, { passed: 18 }),
      finding("fingerprint", "fail", 6),
      finding("logprobs", "pass", 12, { agreement: 10 }),
      finding("shape", "pass", 2),
      finding("cache", "suspect", 120),
      finding("mystery", "pass", 1),
    ],
    protocolId: "aio-identity-v2",
  });

  assert.deepEqual(view.claims, ["claim one"]);
  assert.deepEqual(view.limits, ["limit one"]);
  assert.equal(view.statusLabel, "Consistent with reference");
  assert.equal(view.findings[0].label, "Canary leakage");
  assert.match(view.findings[0].detail, /revealed the canary phrase on 6 probes/);
  assert.match(view.findings[1].detail, /passed at 8192 tokens of 128K/);
  assert.match(view.findings[2].detail, /conformed on 6 schemas/);
  assert.match(view.findings[3].detail, /violated the protocol invariants/);
  assert.match(view.findings[4].detail, /All 18 repeated prompts agreed/);
  assert.match(view.findings[5].detail, /18 of 20 exact-answer canaries/);
  assert.match(view.findings[6].detail, /noise rule/);
  assert.match(view.findings[7].detail, /10 of 12/);
  assert.match(view.findings[8].detail, /well formed/);
  assert.match(view.findings[9].detail, /consistent with replay/);
  assert.equal(view.findings[10].label, "mystery");
  assert.equal(JSON.stringify(view).toLowerCase().includes("jsd"), false);
  assert.equal(JSON.stringify(view).includes("baseUrl"), false);
});

test("not-tested and inconclusive findings carry honest copy", () => {
  const verdict = {
    id: "v1",
    runId: "r1",
    targetModelId: "free/model-a",
    status: "inconclusive",
    summary: verdictSummary("inconclusive"),
    claimsJson: "[]",
    limitsJson: "[]",
    coverageJson: "{}",
    testedAt: NOW,
    validUntil: NOW,
    published: 1,
    publishedAt: NOW,
    publishedBy: "operator",
    createdAt: NOW,
  };
  const view = publishedView({
    verdict,
    findings: [
      {
        id: "a",
        runId: "r1",
        class: "tools",
        metric: "schema",
        observed: null,
        threshold: null,
        n: 6,
        state: "not_tested",
        evidenceJson: "{}",
        createdAt: NOW,
      },
      {
        id: "b",
        runId: "r1",
        class: "tools",
        metric: "schema",
        observed: null,
        threshold: null,
        n: 6,
        state: "inconclusive",
        evidenceJson: "{}",
        createdAt: NOW,
      },
    ],
    protocolId: "aio-identity-v2",
  });

  assert.equal(view.findings[0].detail, "Not tested.");
  assert.match(view.findings[1].detail, /Inconclusive on 6 probes/);
  assert.equal(findingLabel("unknown"), "unknown");
  assert.equal(findingLabel("canary"), "Canary leakage");
});

test("applyPublicationTtl expires consistency claims only", () => {
  const base = {
    id: "v1",
    runId: "r1",
    targetModelId: "free/model-a",
    summary: "original",
    claimsJson: '["claim"]',
    limitsJson: "[]",
    coverageJson: "{}",
    testedAt: "2026-10-01T12:00:00.000Z",
    validUntil: "2026-10-08T12:00:00.000Z",
    published: 1,
    publishedAt: NOW,
    publishedBy: "operator",
    createdAt: NOW,
  };

  for (const status of ["baseline", "self_consistent", "consistent"]) {
    const result = applyPublicationTtl({ ...base, status }, NOW);

    assert.equal(result.status, "stale");
    assert.equal(result.claimsJson, "[]");
    assert.equal(result.summary, verdictSummary("stale", { days: 7 }));
  }

  for (const status of ["mismatch_confirmed", "divergent_review", "error"]) {
    assert.equal(applyPublicationTtl({ ...base, status }, NOW).status, status);
  }

  const current = applyPublicationTtl(
    { ...base, status: "consistent", validUntil: "2026-11-08T12:00:00.000Z" },
    NOW,
  );

  assert.equal(current.status, "consistent");
  assert.equal(current.summary, "original");
});

test("publicIdentityView applies the TTL before rendering the panel", () => {
  const view = publicIdentityView(
    {
      id: "v1",
      runId: "r1",
      targetModelId: "free/model-a",
      status: "consistent",
      summary: verdictSummary("consistent", { date: "2026-10-01", n: 6 }),
      claimsJson: '["claim"]',
      limitsJson: "[]",
      coverageJson: "{}",
      testedAt: "2026-10-01T12:00:00.000Z",
      validUntil: "2026-10-08T12:00:00.000Z",
      published: 1,
      publishedAt: NOW,
      publishedBy: "operator",
      createdAt: NOW,
    },
    [],
    "aio-identity-v2",
    NOW,
  );

  assert.equal(view.status, "stale");
  assert.equal(view.statusLabel, "Stale");
  assert.deepEqual(view.claims, []);
});
