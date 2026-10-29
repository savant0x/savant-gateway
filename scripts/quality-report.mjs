import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "protocol.config.yaml");
const scanRoots = ["app", "components", "config", "lib"];
const sourceFile = /\.(ts|tsx)$/;
const ignored = /(^|[\\/])(node_modules|\.next|dist)([\\/]|$)/;

function readCeiling() {
  const lines = fs
    .readFileSync(configPath, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const qualityIndex = lines.findIndex((line) => line.trim() === "quality:");

  if (qualityIndex === -1) {
    throw new Error("protocol.config.yaml has no top-level quality block");
  }

  const raw = lines
    .slice(qualityIndex + 1)
    .map((line) => line.match(/^\s+max_file_lines:\s*(\S+)\s*$/)?.[1])
    .find((value) => value !== undefined);
  const ceiling = Number(raw);

  if (!Number.isInteger(ceiling) || ceiling <= 0) {
    throw new Error(`quality.max_file_lines is not a positive integer: ${raw}`);
  }

  return ceiling;
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...filesUnder(fullPath));
    } else if (sourceFile.test(entry.name) && !ignored.test(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

const ceiling = readCeiling();
const violations = [];
const files = scanRoots.flatMap((directory) => filesUnder(path.join(root, directory)));

for (const file of files) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const lineCount = fs.readFileSync(file, "utf8").split(/\r?\n/).length;

  if (lineCount > ceiling) {
    violations.push(`${relative}: ${lineCount} lines exceeds ${ceiling}`);
  }
}

if (violations.length > 0) {
  console.error(`quality: FAIL (${violations.length} file(s) over ${ceiling} lines)`);

  for (const violation of violations) console.error(`- ${violation}`);

  process.exitCode = 1;
} else {
  console.log(`quality: PASS (${ceiling}-line ceiling, ${files.length} files scanned)`);
}
