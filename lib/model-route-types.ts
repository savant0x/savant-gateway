/** A provider row competing for one published model, for the admin catalog. */
export type ModelRouteSummary = {
  providerSlug: string;
  upstreamId: string;
  /**
   * The marketplace publisher inside the upstream id (`cc`, `cb`, `zai`), or
   * null when the id names no publisher. One provider row can sell the same
   * weights from many publishers, so the account slug alone cannot tell two
   * offers apart.
   */
  publisher: string | null;
  costInputPer1M: number;
  costOutputPer1M: number;
  primary: boolean;
  status: string;
};

/** One provider's catalog row, before routing is reconciled. */
export type SyncedModel = {
  id: string;
  upstreamId: string;
  upstreamSlug: string;
  /** Provider-neutral identity: the same model on two providers shares it. */
  routeGroup: string;
  name: string;
  family: string;
  protocol: "chat" | "messages";
  costSource: "synced" | "unknown";
  contextWindow: string;
  tokenWeight: number;
  costInputMicros: number;
  costOutputMicros: number;
  allowFree: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  health: string | null;
  sortOrder: number;
};
