#!/usr/bin/env node
/**
 * Storage contract check — FID-2026-1031-086.
 *
 * The Postgres port (FID-085) is complete in `lib/storage/` and unused by the
 * application. The flip is one commit, and this is what defines "done": no file
 * under `app/` or `lib/` may import the SQLite handle, and no `lib/store/*`
 * module may declare its own statements.
 *
 * This exits 1 while the flip is unfinished. That is the expected state and it
 * is deliberate: a green build that hides a second live engine is how a credit
 * hold ends up split across two databases. Do not loosen this check to make a
 * gate pass — read the FID.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sqliteHandle = join(root, "lib", "db.ts");
const scanRoots = ["app", "lib"];
const skipDirectories = new Set(["node_modules", ".next", ".git", "data"]);

const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function walk(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    if (skipDirectories.has(entry)) continue;

    const full = join(directory, entry);
    const stats = statSync(full);

    if (stats.isDirectory()) {
      walk(full, files);

      continue;
    }

    if (/\.(ts|tsx|mts)$/.test(entry)) files.push(full);
  }

  return files;
}

function resolvesToSqliteHandle(fromFile, specifier) {
  if (specifier === "@/lib/db") return true;
  if (!specifier.startsWith(".")) return false;

  // Import specifiers usually omit the extension (`../db`), so compare the
  // literal path and the TypeScript-resolved ones. Without this the check only
  // sees `@/lib/db` importers and misses every `lib/store` module.
  const base = resolve(fromFile, "..", specifier);

  return [base, `${base}.ts`, `${base}.tsx`].includes(sqliteHandle);
}

const importers = [];
const legacyStatements = [];

for (const scanRoot of scanRoots) {
  for (const file of walk(join(root, scanRoot))) {
    if (file === sqliteHandle) continue;

    const source = readFileSync(file, "utf8");
    const relativePath = relative(root, file).replaceAll("\\", "/");

    for (const match of source.matchAll(IMPORT_SPECIFIER)) {
      if (resolvesToSqliteHandle(file, match[1])) {
        importers.push(relativePath);

        break;
      }
    }

    if (relativePath.startsWith("lib/store/")) {
      const count = (source.match(/\.prepare\(/g) ?? []).length;

      if (count > 0) legacyStatements.push({ file: relativePath, count });
    }
  }
}

const statementTotal = legacyStatements.reduce((sum, row) => sum + row.count, 0);

console.log("storage contract (FID-2026-1031-086)");
console.log(`  sqlite handle importers under app/, lib/: ${importers.length}`);
console.log(`  lib/store modules with inline statements: ${legacyStatements.length}`);
console.log(`  legacy statements: ${statementTotal}`);

if (importers.length > 0) {
  console.log("\nimporters:");

  for (const file of importers.sort()) console.log(`  ${file}`);
}

if (legacyStatements.length > 0) {
  console.log("\nlegacy statements:");

  for (const row of legacyStatements.sort((a, b) => b.count - a.count)) {
    console.log(`  ${row.file} ${row.count}`);
  }
}

const clean = importers.length === 0 && statementTotal === 0;

console.log(
  clean
    ? "\nPASS — one storage engine, resolved at lib/storage/runtime.ts"
    : "\nFAIL — the SQLite path is still live. This is expected until the flip\n" +
        "(FID-2026-1031-086 step 4) lands; it is wired into npm run verify then.",
);

process.exit(clean ? 0 : 1);
