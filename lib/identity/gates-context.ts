import { CONTEXT_NEEDLES, SAMPLING } from "./battery.ts";
import { contextDepths, parseContextWindow } from "./context-window.ts";
import { normalizeResponse } from "./normalize.ts";
import { ask, type GateContext, type GateResult } from "./gates.ts";

export type ContextGate = GateResult & { testedDepth: number | null };

function contextPrompt(code: string, tokens: number) {
  const unit = "The quick brown fox jumps over the lazy dog. ";
  const repeats = Math.max(1, Math.ceil((tokens * 4) / unit.length));

  return `${unit.repeat(repeats)}
The access code for this check is ${code}. Remember it.
Question: What is the access code? Answer with only the code.`;
}

export async function runContext(context: GateContext): Promise<ContextGate> {
  const advertised = parseContextWindow(context.target.contextWindow);
  const depths = contextDepths(advertised);

  if (depths.length === 0) {
    return {
      state: "not_tested",
      n: 0,
      note: "The advertised context window could not be parsed.",
      testedDepth: null,
      evidence: { advertised: context.target.contextWindow, depths: [] },
    };
  }

  const passedDepths: number[] = [];
  const failedDepths: number[] = [];
  let unavailable = 0;

  for (const needle of CONTEXT_NEEDLES) {
    for (const depth of depths) {
      const result = await ask(
        context,
        `context:${needle.id}:${depth}`,
        "target",
        0,
        contextPrompt(needle.code, depth),
        SAMPLING.context,
      );

      if (!result.ok) {
        unavailable += 1;
        continue;
      }

      const reported = result.promptTokens ?? depth;

      if (normalizeResponse(result.content).includes(needle.code)) {
        passedDepths.push(reported);
      } else {
        failedDepths.push(reported);
      }
    }
  }

  const testedDepth =
    passedDepths.length > 0 ? Math.max(...passedDepths) : null;
  const state =
    passedDepths.length > 0 && failedDepths.length > 0
      ? "fail"
      : passedDepths.length > 0
        ? "pass"
        : unavailable > 0
          ? "not_tested"
          : "inconclusive";

  return {
    state,
    n: CONTEXT_NEEDLES.length * depths.length,
    note:
      state === "pass"
        ? null
        : state === "fail"
          ? "Context retrieval failed at a deeper probe after passing at a shallower depth."
          : "Context retrieval did not produce a usable result.",
    testedDepth,
    evidence: {
      advertised: context.target.contextWindow,
      depths,
      passedDepths,
      failedDepths,
      unavailable,
    },
  };
}
