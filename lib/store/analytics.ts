import "server-only";

import type { AnalyticsData } from "../types";

import { db } from "../db";
import {
  ANALYTICS_RANGES,
  normalizeAnalyticsRange,
  readAnalyticsData,
  type AnalyticsRange,
} from "../analytics";

export { ANALYTICS_RANGES, normalizeAnalyticsRange };
export type { AnalyticsRange };

export function getAnalyticsData(rangeDays: AnalyticsRange): AnalyticsData {
  return readAnalyticsData(db, rangeDays);
}
