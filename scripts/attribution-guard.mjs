/**
 * No-agent-credit guard (FID-2026-1102-108).
 *
 * Modes:
 *   --message-file <path>  one commit message (the commit-msg hook)
 *   --range <from..to>     the exact commits being pushed (the pre-push hook)
 *   --all                  full reachable history (CI and manual audit)
 *   --documents            governed Markdown records (FIDs, summaries, roots)
 *
 * The default remains full history for backward compatibility. Every mode
 * fails closed on an unreadable source or a credit line.
 */

import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { findAttributionHits } from "./attribution-patterns.mjs";
import { scanDocuments } from "./attribution-document-guard.mjs";

const args = process.argv.slice(2);

function usage() {
  console.error(
    "usage: attribution-guard [--message-file <path> | --range <from..to> | --all | --documents]",
  );
}

function readFile(file) {
  if (!file || file.startsWith("--") || !fs.existsSync(file)) {
    throw new Error("--message-file needs a readable path");
  }

  return fs.readFileSync(file, "utf8");
}

function readRange(range) {
  if (!range || range.startsWith("--")) {
    throw new Error("--range needs a git revision range");
  }

  return execFileSync("git", ["log", "--format=%B", range], {
    encoding: "utf8",
  });
}

function readAll() {
  return execFileSync("git", ["log", "--format=%B", "--all"], {
    encoding: "utf8",
  });
}

function reportHistory(hits) {
  if (hits.length === 0) {
    console.log("attribution-guard: PASS (no coding-agent credit found)");
    return;
  }

  console.error("attribution-guard: a coding agent is credited in this repository");

  for (const hit of hits.slice(0, 20)) console.error(`- ${hit.text}`);

  process.exit(1);
}

function reportDocuments(hits) {
  if (hits.length === 0) {
    console.log("attribution-guard: PASS (no governed credit line found)");
    return;
  }

  console.error(
    "attribution-guard: a coding agent is credited in governed records",
  );

  for (const hit of hits.slice(0, 40)) {
    console.error(`- ${hit.file}:${hit.line}: ${hit.text}`);
  }

  process.exit(1);
}

function main() {
  const messageIndex = args.indexOf("--message-file");
  const rangeIndex = args.indexOf("--range");
  const documents = args.includes("--documents");
  const modes = [messageIndex !== -1, rangeIndex !== -1, documents].filter(
    Boolean,
  ).length;

  if (args.includes("--help")) {
    usage();
    return;
  }

  if (modes > 1) {
    usage();
    process.exit(2);
  }

  if (documents) {
    try {
      reportDocuments(scanDocuments());
    } catch (error) {
      console.error(`attribution-guard: ${error.message}`);
      process.exit(2);
    }

    return;
  }

  let text;

  try {
    if (messageIndex !== -1) {
      text = readFile(args[messageIndex + 1]);
    } else if (rangeIndex !== -1) {
      text = readRange(args[rangeIndex + 1]);
    } else {
      text = readAll();
    }
  } catch (error) {
    console.error(`attribution-guard: ${error.message}`);
    process.exit(2);
  }

  reportHistory(findAttributionHits(text));
}

main();
