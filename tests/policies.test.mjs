import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  isPolicySlug,
  isPolicyVersion,
  POLICIES,
  POLICY_CONTACT,
  POLICY_EFFECTIVE_DATE,
  POLICY_EFFECTIVE_LABEL,
  POLICY_OPERATOR,
  POLICY_SLUGS,
  POLICY_VERSION,
  POLICY_VERSION_LABEL,
  policyHref,
} from "../lib/legal-meta.ts";
import { parseInline, parsePolicy } from "../lib/legal-markdown.ts";

const body = (slug, version = POLICY_VERSION) =>
  readFileSync(
    new URL(`../content/legal/${version}/${slug}.md`, import.meta.url),
    "utf8",
  );

test("every published policy has text with no unreplaced placeholder", () => {
  for (const slug of POLICY_SLUGS) {
    const source = body(slug);

    assert.match(source, /^## \S/, `${slug} starts with a heading`);
    assert.ok(
      !/\[(?:OPERATOR DECISION|JURISDICTION|DATE|LEGAL ENTITY|CONTACT|RETENTION)/.test(
        source,
      ),
      `${slug} still has a placeholder`,
    );
    assert.ok(!/DRAFT|TBD|TODO|not published/i.test(source), `${slug} has draft text`);

    const blocks = parsePolicy(source);
    const headings = blocks.filter((block) => block.kind === "heading");

    assert.ok(headings.length >= 4, `${slug} has too few sections`);
    assert.ok(
      blocks.some((block) => block.kind === "paragraph"),
      `${slug} has no paragraph`,
    );
    assert.ok(
      blocks.every(
        (block) =>
          block.kind !== "paragraph" ||
          block.segments.some(
            (segment) => segment.kind !== "text" || segment.value.trim() !== "",
          ),
      ),
      `${slug} has an empty paragraph`,
    );
  }
});

test("the published text carries the decided positions", () => {
  const terms = body("terms");
  const privacy = body("privacy");
  const refunds = body("refunds");
  const use = body("acceptable-use");

  assert.match(terms, /at least 18\s+years old/);
  assert.match(terms, /Subscriptions are not for sale/);
  assert.match(terms, /no uptime guarantee/);
  assert.match(terms, /Kentucky/);
  assert.match(terms, /three months before/);
  assert.match(terms, /Stripe/);

  assert.match(privacy, /scrypt/);
  assert.match(privacy, /seven\s+days/);
  assert.match(privacy, /30\s+days/);
  assert.match(privacy, /usage\s+events are retained/i);
  assert.match(privacy, /Artificial Analysis/);

  assert.match(refunds, /Duplicate or erroneous charge/);
  assert.match(refunds, /no refund call to Stripe/);
  assert.match(refunds, /has no expiry/);

  assert.match(use, /high-impact decision/);
  assert.match(use, /Building your own product/);
  assert.match(use, /Prohibited uses/);
});

test("the version, dates and operator identity agree", () => {
  assert.equal(POLICY_VERSION, "v1");
  assert.equal(POLICY_VERSION_LABEL, "1.0");
  assert.match(POLICY_EFFECTIVE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(POLICY_EFFECTIVE_LABEL, "30 October 2026");
  assert.equal(
    new Date(`${POLICY_EFFECTIVE_DATE}T00:00:00Z`).toISOString().slice(0, 10),
    POLICY_EFFECTIVE_DATE,
  );
  assert.equal(POLICY_OPERATOR, "Savant AI");
  assert.match(POLICY_CONTACT, /^[^@\s]+@[^@\s]+$/);

  assert.deepEqual(POLICY_SLUGS, [
    "terms",
    "privacy",
    "refunds",
    "acceptable-use",
  ]);
  assert.ok(POLICY_SLUGS.every((slug) => POLICIES[slug].title.length > 0));
});

test("routes are stable for the current version and permanent for older ones", () => {
  assert.equal(policyHref("terms"), "/terms");
  assert.equal(policyHref("acceptable-use"), "/acceptable-use");
  assert.equal(policyHref("terms", "v1"), "/terms");
  assert.equal(policyHref("terms", "v0"), "/legal/v0/terms");

  assert.ok(isPolicyVersion("v1"));
  assert.ok(!isPolicyVersion("v2"));
  assert.ok(isPolicySlug("privacy"));
  assert.ok(!isPolicySlug("cookies"));
});

test("only the documented markdown is interpreted", () => {
  const blocks = parsePolicy(
    [
      "## A heading",
      "",
      "A paragraph that",
      "wraps onto a second line.",
      "",
      "- one",
      "- **two**",
      "",
      "1. first",
      "2. second",
    ].join("\n"),
  );

  assert.deepEqual(
    blocks.map((block) => block.kind),
    ["heading", "paragraph", "list", "list"],
  );
  assert.equal(blocks[1].segments[0].value, "A paragraph that wraps onto a second line.");
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[2].items.length, 2);
  assert.deepEqual(blocks[2].items[1], [{ kind: "strong", value: "two" }]);
  assert.equal(blocks[3].ordered, true);
  assert.deepEqual(blocks[3].items[1], [{ kind: "text", value: "second" }]);
});

test("inline links, code and emphasis parse without losing text", () => {
  const segments = parseInline(
    "See [the terms](/terms) and `POST /v1` plus **bold** at the end.",
  );

  assert.deepEqual(segments, [
    { kind: "text", value: "See " },
    { kind: "link", value: "the terms", href: "/terms" },
    { kind: "text", value: " and " },
    { kind: "code", value: "POST /v1" },
    { kind: "text", value: " plus " },
    { kind: "strong", value: "bold" },
    { kind: "text", value: " at the end." },
  ]);
});
