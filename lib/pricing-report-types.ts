import type { AdminModelSummary } from "./types.ts";
import type { EconomicsScenario } from "./catalog-economics.ts";
import type {
  PriceRecommendation,
  RoundingPolicy,
} from "./price-recommendation.ts";

/**
 * Sandbox pricing economics report contract (FID-2026-1103-153).
 *
 * The report is a read-only projection. It never writes a price; approval stays
 * on `PATCH /api/admin/pricing`. Scenario profit is modeled at a labelled token
 * workload, never a realized settlement.
 */

export type PricingReportClass =
  | "free"
  | "subscription"
  | "unknown"
  | "stale"
  | "blocked"
  | "review-required"
  | "safe";

export type PricePoint = {
  inputMicros: number;
  outputMicros: number;
  inputMarginBps: number | null;
  outputMarginBps: number | null;
  scenarioRevenueMicros: number;
  scenarioCostMicros: number;
  scenarioProfitMicros: number;
};

export type PricingReportRow = {
  id: string;
  name: string;
  access: AdminModelSummary["access"];
  groupSlug: string;
  groupLabel: string;
  inCatalog: boolean;
  upstreamProvider: string;
  servingProvider: string | null;
  routeTakeover: boolean;
  costSource: AdminModelSummary["costSource"];
  costObservedAt: string | null;
  costInputMicros: number;
  costOutputMicros: number;
  priceSource: AdminModelSummary["priceSource"];
  syncedAt: string;
  classification: PricingReportClass;
  eligible: boolean;
  explanation: string;
  blockers: string[];
  warnings: string[];
  current: PricePoint;
  recommendation: PriceRecommendation;
  recommended: PricePoint | null;
  change: {
    inputBps: number | null;
    outputBps: number | null;
    maxAbsBps: number | null;
    direction: "increase" | "decrease" | "unchanged" | "new";
  };
  /** Absolute scenario-profit movement, used to rank review work. */
  impactMicros: number;
};

export type PricingReportOptions = {
  targetMarginBps: number;
  rounding?: RoundingPolicy;
  scenario?: EconomicsScenario;
  now?: Date;
  staleAfterDays?: number;
  minimumSellMicros?: number;
  /** A relative move larger than this needs explicit review. 25% default. */
  reviewThresholdBps?: number;
  includeOutOfCatalog?: boolean;
};

export type PricingReportSummary = {
  generatedAt: string;
  source: "sandbox";
  scenario: EconomicsScenario;
  targetMarginBps: number;
  rounding: RoundingPolicy;
  reviewThresholdBps: number;
  counts: Record<PricingReportClass, number>;
  paidRows: number;
  reviewRows: number;
  blockedRows: number;
  currentScenarioProfitMicros: number;
  recommendedScenarioProfitMicros: number;
  modeledProfitDeltaMicros: number;
  excludedOutOfCatalog: number;
  autoPublish: false;
};

export type PricingReport = {
  report: "sandbox-pricing-economics";
  schema: 1;
  summary: PricingReportSummary;
  rows: PricingReportRow[];
};

export const DEFAULT_REVIEW_THRESHOLD_BPS = 2_500;
