import fs from "node:fs";
import { execFileSync } from "node:child_process";

const AGENT =
  /(codebuff|freebuff|buffy|claude|anthropic|openai|codex|copilot|cursor|windsurf|aider|devin|opencode|cline|gemini|qwen|mistral|llama|grok)/i;

function findings(text) {
  const hits = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (/^co-authored-by:/i.test(trimmed) && AGENT.test(trimmed)) {
      hits.push(trimmed);
    }

    if (/generated (with|by)\b/i.test(trimmed) && AGENT.test(trimmed)) {
      hits.push(trimmed);
    }

    if (trimmed.includes("🤖")) hits.push(trimmed);
  }

  return hits;
}

const args = process.argv.slice(2);
const messageIndex = args.indexOf("--message-file");
let text = "";

if (messageIndex !== -1) {
  const file = args[messageIndex + 1];

  if (!file || !fs.existsSync(file)) {
    console.error("attribution-guard: --message-file needs a readable path");
    process.exit(2);
  }

  text = fs.readFileSync(file, "utf8");
} else {
  try {
    text = execFileSync("git", ["log", "--format=%B", "--all"], {
      encoding: "utf8",
    });
  } catch (error) {
    console.error(`attribution-guard: could not read git history: ${error.message}`);
    process.exit(2);
  }
}

const hits = findings(text);

if (hits.length > 0) {
  console.error("attribution-guard: a coding agent is credited in this repository");

  for (const hit of hits.slice(0, 20)) console.error(`- ${hit}`);

  process.exit(1);
}

console.log("attribution-guard: PASS (no coding-agent credit found)");
