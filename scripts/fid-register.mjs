import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const filenamePattern = /^(FID-\d{4}-\d{4}-\d{3})-[a-z0-9-]+\.md$/;
const activeStatuses = new Set(["converged", "fixed"]);
const archivedStatuses = new Set(["closed", "verified", "superseded"]);
const evidenceLabel =
  /^\s*(?:[-*]\s+(?:\[[xX ]\]\s+)?)?(?:\*\*)?(?:Commits?|Commit SHAs?|Implementation(?: commits?| SHAs?)?|Closed Against|Archived|Verification Evidence)(?:\*\*)?:(?:\*\*)?/i;
const evidencePhrase =
  /\b(?:implementation commit|closed against|repair commit|commit)\s+`[0-9a-f]{7,40}`/gi;

function metadata(text, field) {
  return new RegExp("^(?:- )?\\*\\*" + field + ":\\*\\*[ \\t]+([^\\s]+)", "m")
    .exec(text)?.[1];
}

export function closureCommits(text) {
  const commits = new Set();
  let inEvidenceField = false;
  for (const line of text.split(/\r?\n/)) {
    inEvidenceField = evidenceLabel.test(line) || (inEvidenceField && /^ {2,}\S/.test(line));
    const evidence = inEvidenceField
      ? line
      : Array.from(line.matchAll(evidencePhrase), (match) => match[0]).join(" ");
    for (const [, hash] of evidence.matchAll(/`([0-9a-f]{7,40})`/gi)) {
      commits.add(hash);
    }
  }
  return [...commits];
}

function includesId(text, id) {
  return new RegExp("(?<![\\w-])" + id + "(?![\\w-])").test(text);
}

function localMarkdownLinks(root, file, text, errors) {
  for (const [, target] of text.matchAll(/\[[^\]\n]+\]\(([^\s)#]+\.md)(?:#[^)]*)?\)/g)) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(target)) continue;
    if (!existsSync(resolve(root, dirname(file), target))) {
      errors.push(file + ": broken Markdown link " + target);
    }
  }
}

function archiveEvidence(file, id, status, text, commits, errors) {
  const hasClosure = /^## (?:\d+\. )?(?:Resolution|Closure)\b/m.test(text);
  if (!hasClosure) errors.push(file + ": missing closure section");

  const noCode = id === "FID-2026-1104-012" && /archived without commit/i.test(text);
  const superseded = status === "superseded" && /^- \*\*Superseded\b/m.test(text);
  const hashes = closureCommits(text);
  if (hashes.length === 0 && !noCode && !superseded) {
    errors.push(file + ": missing closure commit");
  }
  for (const hash of hashes) {
    const records = commits.get(hash) ?? [];
    records.push(file);
    commits.set(hash, records);
  }
}

function checkCommits(root, commits, errors) {
  if (commits.size === 0) return;
  const hashes = [...commits.keys()];
  const result = spawnSync("git", ["cat-file", "--batch-check"], {
    cwd: root,
    input: hashes.map((hash) => hash + "^{commit}").join("\n") + "\n",
    encoding: "utf8",
  });
  const rows = result.stdout?.trim().split("\n") ?? [];
  if (result.status !== 0 || rows.length !== hashes.length) {
    errors.push("git cat-file could not verify archived FID commits");
    return;
  }
  for (const [index, hash] of hashes.entries()) {
    if (/^[0-9a-f]+ commit \d+\s*$/.test(rows[index])) continue;
    for (const file of commits.get(hash)) errors.push(file + ": invalid closure commit " + hash);
  }
}

export function checkFidRegister(root) {
  const base = "dev/fids";
  const read = (file) => readFileSync(join(root, file), "utf8").replace(/^\uFEFF/, "");
  const index = read(base + "/README.md");
  const scope = read("SCOPE.md");
  const changelog = read("CHANGELOG.md");
  const rows = new Map();
  const errors = [];
  const ids = new Set();
  const commits = new Map();
  let active = 0;

  localMarkdownLinks(root, base + "/README.md", index, errors);
  for (const line of index.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const [, reference, , status] = line.split("|");
    const name = /\]\((FID-[^/)]+\.md)\)/.exec(reference)?.[1];
    if (!name) continue;
    if (rows.has(name)) errors.push("duplicate active queue entry: " + name);
    rows.set(name, status?.trim());
  }

  for (const directory of [base, base + "/archive"]) {
    const archived = directory !== base;
    for (const name of readdirSync(join(root, directory)).filter((entry) => /^FID-.*\.md$/i.test(entry))) {
      const file = directory + "/" + name;
      const text = read(file);
      const id = filenamePattern.exec(name)?.[1];
      const status = metadata(text, "Status");
      if (!id || metadata(text, "ID") !== id) {
        errors.push(file + ": missing or mismatched ID");
        continue;
      }
      if (ids.has(id)) errors.push(file + ": duplicate ID " + id);
      ids.add(id);
      if (metadata(text, "Filename")?.replace(/^`|`$/g, "") !== name) {
        errors.push(file + ": missing or mismatched Filename metadata");
      }
      for (const field of ["Severity", "Created"]) {
        if (!metadata(text, field)) errors.push(file + ": missing " + field + " metadata");
      }
      if (!(archived ? archivedStatuses : activeStatuses).has(status)) {
        errors.push(file + ": unexpected status " + (status ?? "(missing)"));
      }
      localMarkdownLinks(root, file, text, errors);
      if (archived) {
        if (!includesId(changelog, id)) errors.push(file + ": missing CHANGELOG.md entry");
        archiveEvidence(file, id, status, text, commits, errors);
        continue;
      }
      active += 1;
      if (rows.get(name) !== status) errors.push(file + ": missing or mismatched active queue row");
      rows.delete(name);
      if (!includesId(scope, id)) errors.push(file + ": missing SCOPE.md registration");
      if (status === "converged") continue;
      const tests = Array.from(text.matchAll(/`(tests\/[A-Za-z0-9._/-]+\.test\.mjs)`/g), (match) => match[1]);
      for (const test of new Set(tests)) {
        if (!existsSync(join(root, test))) errors.push(file + ": missing promised test " + test);
      }
    }
  }
  for (const name of rows.keys()) errors.push("stale active queue row: " + name);
  checkCommits(root, commits, errors);
  return { active, errors };
}
