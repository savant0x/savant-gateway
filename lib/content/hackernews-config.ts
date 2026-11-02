/**
 * Hacker News source policy (FID-2026-1102-110).
 *
 * The public v0 API has ranked id lists but no topic search, so the source
 * narrows a bounded candidate window locally. Keeping the host, stream paths,
 * and vocabulary in one pure module means the admin form, the adapter, and the
 * tests cannot drift about which URLs are legal or what "AI" means here.
 */

import { normalizeFilterTerms } from "./taxonomy.ts";

export const HACKERNEWS_API_BASE = "https://hacker-news.firebaseio.com/v0";

export const HACKERNEWS_STREAMS = [
  "top",
  "new",
  "best",
  "ask",
  "show",
] as const;

export type HackerNewsStream = (typeof HACKERNEWS_STREAMS)[number];

export const HACKERNEWS_STREAM_PATHS: Record<HackerNewsStream, string> = {
  top: "topstories.json",
  new: "newstories.json",
  best: "beststories.json",
  ask: "askstories.json",
  show: "showstories.json",
};

export const HACKERNEWS_STREAM_LABELS: Record<HackerNewsStream, string> = {
  top: "Top stories",
  new: "New stories",
  best: "Best stories",
  ask: "Ask HN",
  show: "Show HN",
};

/**
 * Deliberately broad enough to find AI discussion in a general ranked feed,
 * but token-bounded. A phrase counts only at a word/phrase edge, so "said" is
 * not an "AI" match and "strain" is not "training".
 */
export const DEFAULT_HACKERNEWS_INCLUDE = [
  "ai",
  "artificial intelligence",
  "agent",
  "agents",
  "agentic",
  "llm",
  "llms",
  "large language model",
  "large language models",
  "language model",
  "language models",
  "model",
  "models",
  "inference",
  "fine-tuning",
  "fine tuning",
  "training",
  "embedding",
  "embeddings",
  "rag",
  "retrieval augmented generation",
  "evaluation",
  "evals",
  "gpu",
  "gpus",
  "robotics",
  "robots",
  "transformer",
  "transformers",
  "diffusion",
  "multimodal",
  "neural network",
  "machine learning",
  "deep learning",
  "openai",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "llama",
  "mistral",
  "cohere",
  "qwen",
  "deepseek",
  "kimi",
  "moonshot ai",
  "zhipu",
  "glm",
  "ernie",
  "doubao",
  "perplexity",
  "ollama",
  "vllm",
  "llama.cpp",
  "langchain",
  "llamaindex",
  "stable diffusion",
  "midjourney",
  "sora",
  "open weights",
  "model weights",
  "hugging face",
  "huggingface",
  "xai",
  "grok",
  "chatgpt",
  "copilot",
  "cursor",
  "synthetic data",
  "alignment",
  "prompt engineering",
  "context window",
  "tokenizer",
  "quantization",
  "open source model",
  "foundation model",
  "foundation models",
  "reasoning model",
  "reasoning models",
  "benchmark",
  "benchmarks",
] as const;

export const HACKERNEWS_FILTER_LIMITS = {
  maxTerms: 24,
  maxTermLength: 60,
  candidateLimit: 120,
  minimumCandidates: 40,
  detailConcurrency: 5,
} as const;

/** `top` → `https://hacker-news.firebaseio.com/v0/topstories.json`. */
export function hackerNewsStreamUrl(stream: HackerNewsStream): string {
  return `${HACKERNEWS_API_BASE}/${HACKERNEWS_STREAM_PATHS[stream]}`;
}

/**
 * Accepts only the exact public list endpoint. The adapter must never become a
 * generic operator-controlled JSON proxy, even though the general source URL
 * policy already blocks loopback and private hosts.
 */
export function hackerNewsStreamFromUrl(raw: string): HackerNewsStream | null {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "hacker-news.firebaseio.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const prefix = "/v0/";

  if (!url.pathname.startsWith(prefix)) return null;

  const file = url.pathname.slice(prefix.length);

  for (const stream of HACKERNEWS_STREAMS) {
    if (file === HACKERNEWS_STREAM_PATHS[stream]) return stream;
  }

  return null;
}

/** Returns the canonical list URL, or null when the endpoint is not allowed. */
export function normalizeHackerNewsUrl(raw: string): string | null {
  const stream = hackerNewsStreamFromUrl(raw);

  return stream ? hackerNewsStreamUrl(stream) : null;
}

/** Operator additions plus the built-in vocabulary; exclusions stay separate. */
export function hackerNewsFilterTerms(config: {
  includeTerms?: unknown;
  excludeTerms?: unknown;
}) {
  return {
    include: normalizeFilterTerms(
      [
        ...DEFAULT_HACKERNEWS_INCLUDE,
        ...(Array.isArray(config.includeTerms) ? config.includeTerms : []),
      ],
      HACKERNEWS_FILTER_LIMITS.maxTerms * 2,
    ),
    exclude: normalizeFilterTerms(
      config.excludeTerms,
      HACKERNEWS_FILTER_LIMITS.maxTerms,
    ),
  };
}
