/**
 * Protocol translation for Anthropic Messages upstreams. The gateway speaks
 * OpenAI Chat Completions to its callers, so each direction lives in its own
 * module and this barrel keeps the adapter and tests on one import.
 */
export { toAnthropicRequest } from "./anthropic-request.ts";
export { toOpenAiCompletion } from "./anthropic-response.ts";
export { anthropicStream } from "./anthropic-stream.ts";
