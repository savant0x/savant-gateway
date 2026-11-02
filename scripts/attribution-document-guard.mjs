/**
 * Governed-document attribution scan (FID-2026-1102-108).
 *
 * Commit metadata is one surface; FIDs, session summaries, changelogs and root
 * governance records are the other. The scan is deliberately narrow: it looks
 * for credit lines, not every mention of a model or vendor. Research copies and
 * third-party material under `docs/research/` are excluded because they are
 * source records, not claims of authorship by this repository.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findAttributionHits } from "./attribution-patterns.mjs";

const ROOT_FILES = [
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "SCOPE.md",
  "knowledge.md",
  "ECHO.md",
  "ECHO-single-agent.md",
  "protocol.config.yaml",
];

const GOVERNED_DIRS = ["dev/fids", "dev/session-summaries", "docs"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "resources",
  "data",
  "docs/research",
]);

function isSkipped(relativePath) {
  return Array.from(SKIPPED_DIRS).some(
    (dir) => relativePath === dir || relativePath.startsWith(`${dir}/`),
  );
}

function walk(directory, root, files) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");

    if (isSkipped(relative)) continue;

    if (entry.isDirectory()) {
      walk(absolute, root, files);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(relative);
    }
  }
}

/** Files the document surface owns, as repo-relative POSIX paths. */
export function governedFiles(root = process.cwd()) {
  const files = [];

  for (const file of ROOT_FILES) {
    if (fs.existsSync(path.join(root, file))) files.push(file);
  }

  for (const directory of GOVERNED_DIRS) {
    walk(path.join(root, directory), root, files);
  }

  return Array.from(new Set(files)).sort();
}

/** Returns `{ file, line, text }` for every credit line in the governed set. */
export function scanDocuments(root = process.cwd()) {
  const hits = [];

  for (const file of governedFiles(root)) {
    const absolute = path.join(root, file);
    let text;

    try {
      text = fs.readFileSync(absolute, "utf8");
    } catch (error) {
      throw new Error(`could not read ${file}: ${error.message}`);
    }

    for (const hit of findAttributionHits(text)) {
      hits.push({ file, line: hit.line, text: hit.text });
    }
  }

  return hits;
}

function main() {
  let hits;

  try {
    hits = scanDocuments();
  } catch (error) {
    console.error(`attribution-document-guard: ${error.message}`);
    process.exit(2);
  }

  if (hits.length === 0) {
    console.log("attribution-document-guard: PASS (no governed credit line)");
    return;
  }

  console.error(
    "attribution-document-guard: a coding agent is credited in governed records",
  );

  for (const hit of hits.slice(0, 40)) {
    console.error(`- ${hit.file}:${hit.line}: ${hit.text}`);
  }

  process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
