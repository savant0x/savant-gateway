import "server-only";

import type { ActivityInput, ActivityKind, ActivitySummary } from "../activity";

import {
  insertActivity,
  insertActivityBestEffort,
  queryActivity,
} from "../activity";
import { db } from "../db";

export function recordActivity(input: ActivityInput) {
  return insertActivity(db, input);
}

export function recordActivityBestEffort(input: ActivityInput) {
  return insertActivityBestEffort(db, input);
}

export function listActivity(
  limit = 50,
  filters: { userId?: string; kind?: ActivityKind } = {},
): ActivitySummary[] {
  return queryActivity(db, limit, filters);
}
