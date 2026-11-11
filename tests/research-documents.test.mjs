import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Mechanical integrity guard for the two research documents.
 *
 * Scope limit, stated so it is not mistaken for more: this test detects
 * renderer-escape damage, unfenced listings, placeholder link targets, missing
 * provenance and unreconciled arithmetic. It cannot detect a false claim that
 * is written cleanly. Truthfulness remains a review obligation, not a gate.
 *
 * The documents are untracked-to-semi-tracked research drafts, not product
 * pages. Their claims are not rendered anywhere and no runtime path reads them.
 */

const DOCUMENTS = [
  "docs/research/Wholesale AI Inference Reseller Market.md",
  "research/AI Inference Reseller Strategy.md",
];

const STRATEGY = "research/AI Inference Reseller Strategy.md";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** A renderer escape artifact is a backslash before a punctuation mark that
 * markdown would otherwise consume. Inside a fence nothing processes them, so
 * they reach the reader verbatim and break the listing. */
const ESCAPE_ARTIFACT = /\\[#_=:.]/;

const BARE_LANGUAGE_LABEL =
  /^(?:YAML|JSON|SQL|Python|Bash|bash|text|Text|TypeScript|JavaScript|javascript)\s*$/;

function scan(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let openedAt = null;

  lines.forEach((line, index) => {
    if (!/^\s*```/.test(line)) return;
    if (openedAt === null) {
      openedAt = index + 1;
    } else {
      blocks.push(lines.slice(openedAt, index));
      openedAt = null;
    }
  });

  return { lines, blocks, balanced: openedAt === null };
}

function dollarsIn(line) {
  return Array.from(line.matchAll(/([-+]?)\$([0-9]+(?:\.[0-9]+)?)/g)).map(
    (match) => (match[1] === "-" ? -1 : 1) * Number(match[2]),
  );
}

test("each research document states its provenance and verification status", () => {
  for (const document of DOCUMENTS) {
    const text = read(document);
    assert.match(text, /\*\*Provenance\.\*\*/, `${document} has no provenance`);
    assert.match(text, /unverified/i, `${document} claims no status limit`);
    assert.match(
      text,
      /\*\*What this is not\.\*\*/,
      `${document} does not bound its own claims`,
    );
  }
});

test("no placeholder citation target survives", () => {
  for (const document of DOCUMENTS) {
    const text = read(document);
    assert.equal(
      text.includes("unknown_url"),
      false,
      `${document} still cites a placeholder`,
    );
    assert.equal(
      /\]\(\s*\)/.test(text),
      false,
      `${document} has an empty link target`,
    );
  }
});

test("no formula is carried as an image reference", () => {
  for (const document of DOCUMENTS) {
    assert.equal(
      /!\[\]\[image\d+\]/.test(read(document)),
      false,
      `${document} still references an inline image for a formula`,
    );
  }
});

test("no listing is left fenced-off behind a bare language label", () => {
  for (const document of DOCUMENTS) {
    const { lines } = scan(read(document));
    lines.forEach((line, index) => {
      assert.equal(
        BARE_LANGUAGE_LABEL.test(line),
        false,
        `${document}:${index + 1} uses a bare language label instead of a fence`,
      );
    });
  }
});

test("fenced listings are balanced and free of escape artifacts", () => {
  for (const document of DOCUMENTS) {
    const { blocks, balanced } = scan(read(document));
    assert.equal(balanced, true, `${document} has an unclosed fence`);
    assert.ok(blocks.length > 0, `${document} declares no fenced listing`);
    for (const block of blocks) {
      for (const [offset, line] of block.entries()) {
        assert.equal(
          ESCAPE_ARTIFACT.test(line),
          false,
          `${document} fence line ${offset + 1} carries an escape artifact: ${line}`,
        );
      }
    }
  }
});

test("the strategy P&L reconciles as gross profit minus fixed cost", () => {
  const lines = read(STRATEGY).split(/\r?\n/);
  const grossLine = lines.find((line) => line.includes("**Gross profit"));
  const netLine = lines.find((line) => line.includes("**Net after hosting"));
  assert.ok(grossLine, "strategy document has no gross-profit row");
  assert.ok(netLine, "strategy document has no net row");

  const gross = dollarsIn(grossLine);
  const net = dollarsIn(netLine);
  assert.equal(gross.length, 3, "gross row must carry three cohorts");
  assert.equal(net.length, 3, "net row must carry three cohorts");

  // Fixed costs as the document states them: $15/month hosting for the small
  // cohorts, and the $30 token package plus $20 infrastructure at 1,000 users.
  const fixed = [15, 15, 50];

  gross.forEach((grossValue, index) => {
    const expected = grossValue - fixed[index];
    assert.ok(
      Math.abs(net[index] - expected) < 0.005,
      `net[${index}] ${net[index]} is not gross ${grossValue} minus ${fixed[index]} (${expected})`,
    );
  });
});

test("the executive retail price matches the pricing table", () => {
  const text = read(STRATEGY);
  assert.match(text, /\$0\.80 per 1M tokens/, "executive retail price missing");
  assert.match(
    text,
    /\$0\.800 \(2\.00x\)/,
    "pricing table does not state the same retail price",
  );
  assert.equal(
    /\$0\.850 \(2\.12x\)/.test(text),
    false,
    "the superseded $0.850 retail price is still present",
  );
});
