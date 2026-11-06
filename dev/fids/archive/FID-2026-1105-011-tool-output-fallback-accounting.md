# FID: Count generated tool output in fallback usage

**Filename:** `FID-2026-1105-011-tool-output-fallback-accounting.md`
**ID:** FID-2026-1105-011
**Severity:** medium
**Status:** closed
**Created:** 2026-11-05 20:45 America/New_York
**Automation level:** 3
**YAGNI-Compliance:** Verified

## Summary

D53: missing or partial upstream usage undercounts generated tool calls. Design
one bounded output-character accounting policy for buffered and streaming
responses, preserving reported provider usage when available. Planning only.

## Environment

Windows, Node 24, PostgreSQL/PGlite; baseline commit `4bd8c1b`.

## Detailed Description

### Problem

`lib/gateway-usage.ts` `completionText` extracts `message.content` only;
`streamDeltaChars` extracts content and reasoning content only. The gateway's
buffered and streaming settlement callers use those results as fallback output
tokens. Function names and generated argument strings in `tool_calls` and
legacy `function_call` are absent, including fragments translated from Anthropic.
The production helpers were probed in this pass with a 16,000-character tool
argument: `{"argumentChars":16000,"bufferedChars":0,"streamChars":0}`.

### Expected Behavior

When output usage is absent, fallback includes generated text, reasoning text
where emitted, and tool/function names and argument fragments without counting
IDs, indices, roles, nulls, metadata or provider usage twice. Buffered and stream
estimates follow equivalent defined character accounting. If output tokens are
reported, they remain authoritative, including zero. Partial input-only usage
retains its reported input and uses the fallback only for output.

### Root Cause and Evidence

`lib/storage/gateway/call.ts` passes `completionText` into
`estimateTokensFromText`; `lib/storage/gateway/stream.ts` adds `streamDeltaChars`
and passes the result to `estimateTokensFromChars`. `lib/usage.ts` selects each
reported component over its fallback. `lib/providers/anthropic-stream.ts` emits
tool names and successive `partial_json` as OpenAI `tool_calls` fragments.

## Impact Assessment

Medium: estimates can understate credit debit, plan/free usage and recorded
provider cost. Affected: output extraction, settlement fallback and tests.
No change to reported counts, holds, pricing or upstream protocol is proposed.

## Proposed Solution

### Approach

Extend existing shared extraction logic with safe, bounded traversal over the
already parsed response. Count only generated string fields: normal content,
reasoning content if present, each function name and arguments in modern tool
calls and legacy function calls. Count streamed fragments once as received;
do not stringify objects, count tool IDs or input arguments, concatenate a whole
stream in memory, or log model output. Reject malformed entries safely without
throwing. Preserve established character-to-token rounding and stream bounds.
For each choice prefer valid modern tool calls if present; otherwise use legacy
function calls. For streaming retain separate scalar counts per representation
and choose at finalization, so a legacy fragment preceding a modern fragment
cannot be double-counted. Preserve text and reasoning counts independently.
Choose per choice index using bounded state; n=1 remains enforced. Preserve the
existing empty-output difference: buffered fallback is at least one token,
stream fallback may be zero. For nonempty equivalent output, count UTF-16 code
units and apply the same ceiling once after all fragments.

### Steps

1. Specify precedence and shared extraction for buffered and streamed output.
2. Integrate with the existing fallback callers and preserve usage priority.
3. Add unit and route/settlement tests with missing and partial usage.
4. Confirm Anthropic translated stream, cancellation and bounded memory paths.

### Verification

Cover 16,000 argument characters, split fragments, multiple tools, legacy call,
mixed text/reasoning/tool fields, null/malformed entries, Unicode and empty
output. Assert buffered/stream equivalent content yields equivalent estimated
count under the declared rounding; exact reported output wins over fallback.
Exercise non-stream and stream settlement for credit and weighted subscription,
including input-only usage and cancellation. No provider calls are required.

## Verification Gates

- gate: lint — `npm run lint`.
- gate: typecheck — `npm run typecheck`.
- gate: test tests/usage-fidelity.test.mjs — existing, extend.
- gate: test tests/gateway-settlement-postgres.test.mjs — existing, extend.
- gate: test tests/tool-output-fallback.test.mjs — planned.
- gate: quality — `npm run quality`.
- gate: build — `npm run build`.
- gate: test:http — `npm run test:http` with fixture coverage.
- gate: verify — `npm run verify` after implementation.

### Verification Receipt

- verified: 2026-11-05T21:27:00-05:00
- lint: exit 0
- typecheck: exit 0
- test tests/usage-fidelity.test.mjs: exit 0 (reported zero wins)
- test tests/gateway-settlement-postgres.test.mjs: exit 0 (tool-only fallback settles)
- test tests/tool-output-fallback.test.mjs: exit 0 (10/10)
- quality: exit 0 (400-line ceiling, 650 files scanned)
- build: exit 0
- test:http: exit 0 (718 main checks plus the trial suite)
- verify: exit 0 (11/11 gates, 1,096/1,096 unit tests, zero skips)

## Perfection Loop

### Loop 1 — RED

- **RED:** generated tool arguments do not affect fallback output counts.
- **GREEN:** count safe generated fields for buffered and streaming shapes.
- **AUDIT:** gateway buffered and stream callers use the named extraction
  functions; Anthropic translation emits `tool_calls` argument fragments.
- **ADVERSARIAL:** double counting legacy plus modern forms, whole-stream
  buffering, malformed payloads and overriding reported zero are unacceptable.
- **CHANGE DELTA:** Initial draft; subsequent passes 5.10% and 0.00%.

### Loop 2 — AUDIT / ADVERSARIAL

Separate stream counters resolve mixed representations without retaining output;
empty-output behavior is preserved. `usage.ts` gives reported counts priority.
The direct 16,000-character probe is evidence of the current defect only.

### Loop 3 — COMPLETE

Design converged; implementation and new tests remain future gates.

### Missed Questions

Are IDs model output tokens? Do not assume so; exclude transport identifiers.
Is the estimate exact tokenization? No. Does provider-reported zero win? Yes.

### Implementation Evidence

- **Commit SHA:** `9f6548f` (`9f6548fc7d8aa651fce1c8785ba63f40d960744f`).
- **File:line ranges:** `lib/gateway-usage.ts:40-142` counts generated text,
  reasoning, modern tool names/arguments and legacy function calls with modern
  precedence; `lib/storage/gateway/stream.ts:63-190` accumulates separate text,
  modern and legacy scalars and chooses at finalization.
- **Gate output:** `npm run verify` exit 0 (11/11); the focused usage,
  settlement and fallback suites are 29/29; `npm run test:http` exit 0 with 718
  main checks plus trial; the full suite is 1,096/1,096 with zero skips.
- **Reproducibility:** `rg "completionText|streamDeltaCounts" lib tests` finds
  the shared extraction and both settlement callers; `node --test
  tests/tool-output-fallback.test.mjs` covers 16,000 argument characters, split
  fragments, Unicode, legacy/modern precedence and Anthropic translation.
- **Step statuses:** 1 implemented (precedence and shared extraction); 2
  implemented (fallback callers and usage priority); 3 implemented (unit and
  settlement coverage); 4 implemented (Anthropic, cancellation and bounded
  memory paths).

## Resolution

- **Closed Date:** 2026-11-05 21:27 America/New_York
- **Fix Description:** missing or partial upstream usage now falls back to
  generated text, reasoning and tool/function names plus argument fragments for
  both buffered and streamed responses. Stream counters stay separate by
  representation; provider-reported usage, including zero, remains authoritative.
- **Tests Added:** Yes — `tests/tool-output-fallback.test.mjs` (10 tests);
  `tests/usage-fidelity.test.mjs` and
  `tests/gateway-settlement-postgres.test.mjs` extended for reported zero and
  tool-only settlement.
- **Verification Evidence:** `npm run verify` PASS, 11/11 gates, 1,096/1,096
  tests, 15/15 PostgreSQL races, 718 HTTP checks plus trial, recovery 14/14;
  implementation commit `9f6548f`. No upstream provider call was required.
- **Archived:** 2026-11-05 21:27 America/New_York

## Lessons Learned

Fallback estimates must include generated tool arguments without changing the
authoritative upstream usage contract.
