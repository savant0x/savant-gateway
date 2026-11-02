/**
 * Shared no-agent-credit vocabulary (FID-2026-1102-108).
 *
 * The guard must distinguish a credit line from ordinary prose that mentions a
 * model or vendor. It therefore matches a credit cue followed by an agent name,
 * not an agent name anywhere in a document. Fenced and inline code is masked
 * first so examples and quoted source text do not become false positives.
 */

const AGENT_NAMES =
  "codebuff|freebuff|buffy|claude|anthropic|openai|codex|copilot|cursor|windsurf|aider|devin|opencode|cline|gemini|qwen|mistral|llama|grok";

const CREDIT_CUE =
  /^(?:co-authored-by:|generated\s+(?:with|by)|credit(?:ed)?\s+to|credit:)\s+/i;

const CREDIT_AGENT = new RegExp(
  `^(?:co-authored-by:|generated\\s+(?:with|by)|credit(?:ed)?\\s+to|credit:)\\s+(?:the\\s+)?(?:${AGENT_NAMES})\\b(?!\\s+(?:SDK|API|model|library|client|driver|platform|service))`,
  "i",
);

const AGENT_EMOJI = "🤖";

function withoutListMarker(line) {
  return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)+/, "");
}

/** Masks fenced blocks and inline code while preserving line numbers. */
export function maskCode(text) {
  const lines = text.split(/\r?\n/);
  let fence = null;

  return lines
    .map((line) => {
      const trimmed = line.trimStart();
      const marker = trimmed.match(/^(```+|~~~+)/)?.[1] ?? null;

      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
          fence = null;
        }

        return "";
      }

      if (marker) {
        fence = marker;
        return "";
      }

      return line.replace(/`[^`\n]*`/g, "");
    })
    .join("\n");
}

/**
 * Returns credit hits as line numbers and the original (unmasked) line. The
 * caller decides whether it is scanning a commit message, history or a file.
 */
export function findAttributionHits(text) {
  const masked = maskCode(text);
  const original = text.split(/\r?\n/);
  const hits = [];

  masked.split(/\r?\n/).forEach((line, index) => {
    const candidate = withoutListMarker(line).trim();

    if (!candidate) return;

    const hasCreditCue = CREDIT_CUE.test(candidate);
    const hasCreditAgent = CREDIT_AGENT.test(candidate);
    const hasEmojiCredit =
      candidate.includes(AGENT_EMOJI) &&
      /^(?:co-authored-by:|generated\s+(?:with|by)|credit(?:ed)?\s+to|credit:)/i.test(
        candidate,
      );

    if (hasCreditAgent || (hasCreditCue && hasEmojiCredit)) {
      hits.push({ line: index + 1, text: original[index]?.trim() ?? candidate });
    }
  });

  return hits;
}
