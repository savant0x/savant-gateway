/**
 * Whole-source execution budget (FID-2026-1104-015).
 *
 * A deadline checked only before each source lets one multi-request source run
 * past the invocation window. This budget is checked at every network and write
 * checkpoint, and exhaustion is a resumable pause rather than an upstream
 * failure.
 */

export class SourceBudgetPaused extends Error {
  constructor() {
    super("The run budget was exhausted before this source finished.");
    this.name = "SourceBudgetPaused";
  }
}

export class IngestBudget {
  private readonly deadlineAt: number;
  private readonly clock: () => number;

  constructor(deadlineMs: number, clock: () => number = Date.now) {
    this.clock = clock;
    this.deadlineAt = clock() + Math.max(0, deadlineMs);
  }

  remainingMs(): number {
    return Math.max(0, this.deadlineAt - this.clock());
  }

  expired(): boolean {
    return this.clock() >= this.deadlineAt;
  }

  /** Throws a pause signal instead of starting work that cannot finish. */
  check(): void {
    if (this.expired()) throw new SourceBudgetPaused();
  }
}

export function boundedFetchText<T extends (url: string) => Promise<string>>(
  fetchText: T,
  budget: IngestBudget,
): T {
  const wrapped = async (url: string) => {
    budget.check();

    return fetchText(url);
  };

  return wrapped as T;
}
