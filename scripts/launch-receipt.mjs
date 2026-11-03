#!/usr/bin/env node
/**
 * Validate an operator launch acceptance receipt (FID-2026-1103-127).
 *
 * This command never creates evidence. A missing file, a failed item, a stale
 * SHA or a recorded no-go is reported as such and exits 1. The receipt is the
 * operator's observation, not the agent's claim.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import {
  ACCEPTANCE_ITEMS,
  evaluateReceipt,
} from "../lib/launch-receipt.ts";

const DEFAULT_FILE = "dev/acceptance/launch-receipt.json";
const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(name);

  return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

if (args.includes("--help")) {
  console.log(`Usage: node scripts/launch-receipt.mjs [--file <path>] [--head <sha>] [--json]

Required receipt fields:
  schema, pinnedSha, items.<id>, approval
Each item needs: status (pass|fail), observedAt, operator, evidence[].
Approval needs: decision (go|no-go), decidedAt, operator, sha, cohort, spendCapUsd.

Items: ${ACCEPTANCE_ITEMS.map((item) => item.id).join(", ")}

The command exits 0 only for a complete pass whose approval SHA equals HEAD.
It never writes or edits a receipt.`);
  process.exit(0);
}

const file = option("--file", DEFAULT_FILE);
const headArg = option("--head", "");
const head = headArg || gitHead();

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

if (!head) {
  console.error("launch-receipt: FAIL — cannot resolve HEAD; pass --head");
  process.exit(1);
}

if (!existsSync(file)) {
  console.log(`launch-receipt: INCOMPLETE — no receipt at ${file}`);
  console.log("Recorded items: none. No observation is inferred from tests.");
  for (const item of ACCEPTANCE_ITEMS) {
    console.log(`  MISSING  ${item.id.padEnd(10)} ${item.label}`);
  }
  process.exit(1);
}

let raw;

try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (error) {
  console.error(
    `launch-receipt: INVALID — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}

const verdict = evaluateReceipt(raw, { headSha: head });

if (args.includes("--json")) {
  console.log(JSON.stringify({ head, file, verdict }, null, 2));
} else {
  console.log(`launch-receipt: ${verdict.status.toUpperCase()} (HEAD ${head.slice(0, 12)})`);

  for (const item of ACCEPTANCE_ITEMS) {
    const row = raw.items?.[item.id];
    const state = verdict.missing.includes(item.id)
      ? "MISSING"
      : verdict.failed.includes(item.id)
        ? "FAIL"
        : (row?.status ?? "unknown").toUpperCase();

    console.log(`  ${state.padEnd(8)} ${item.id.padEnd(10)} ${item.label}`);
  }

  for (const leak of verdict.leaks) console.log(`  LEAK     ${leak}`);
  for (const reason of verdict.reasons) console.log(`  REASON   ${reason}`);
}

process.exitCode = verdict.status === "pass" ? 0 : 1;
