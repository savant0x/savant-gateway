export type AdmissionState = "open" | "paused" | "draining";

export type OperationsThresholds = {
  windowMinutes: number;
  minRequests: number;
  errorRateBps: number;
  settlementMaxAgeSeconds: number;
  paymentMaxAgeSeconds: number;
  quotaMaxAgeSeconds: number;
  reserveMinTokens: number;
  databaseMaxBytes: number;
  backupMaxAgeSeconds: number;
  alertMaxAttempts: number;
  alertRetrySeconds: number;
};

export type OperationsStorage = {
  databaseBytes: number;
  backupCount: number;
  backupAgeSeconds: number | null;
};

export type OperationsSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  traffic: {
    requests: number;
    errors: number;
    errorRateBps: number;
    noTraffic: boolean;
  };
  settlements: {
    admitted: number;
    committed: number;
    quarantined: number;
    oldestUnresolvedAgeSeconds: number | null;
  };
  payments: {
    claimed: number;
    failed: number;
    quarantined: number;
    oldestClaimedAgeSeconds: number | null;
  };
  quota: {
    enabledProviders: number;
    current: number;
    stale: number;
    unknown: number;
    errored: number;
    oldestObservationAgeSeconds: number | null;
    lowReserve: Array<{
      slug: string;
      remainingTokens: number;
    }>;
  };
  money: {
    heldMicros: number;
    quarantinedMicros: number;
    customerCreditMicros: number;
  };
  storage: OperationsStorage;
  admission: {
    state: AdmissionState;
    reason: string | null;
    updatedAt: string | null;
  };
};

export type IncidentSeverity = "warning" | "critical";
export type IncidentStatus = "open" | "resolved";
export type DeliveryState = "unconfigured" | "pending" | "delivered" | "failed";
export type DeliveryKind = "alert" | "recovery";

export type IncidentCandidate = {
  fingerprint: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
};

export type OperationsIncident = {
  id: string;
  fingerprint: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  detail: string;
  firstSeen: string;
  lastSeen: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  deliveryKind: DeliveryKind;
  deliveryState: DeliveryState;
  deliveryAttempts: number;
  lastDeliveryAt: string | null;
  nextAttemptAt: string | null;
  lastDeliveryError: string | null;
};

export type OperationsAlertPayload = {
  id: string;
  fingerprint: string;
  event: DeliveryKind;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  detail: string;
  firstSeen: string;
  lastSeen: string;
  deliveryAttempt: number;
  at: string;
};

export type OperationsDeliveryResult =
  { ok: true } | { ok: false; unconfigured?: boolean; error: string };

export type OperationsTransport = (
  payload: OperationsAlertPayload,
) => Promise<OperationsDeliveryResult>;

export type OperationsTickResult = {
  snapshot: OperationsSnapshot;
  active: number;
  opened: number;
  reopened: number;
  resolved: number;
  delivered: number;
  failed: number;
  unconfigured: number;
};

export const ADMISSION_STATE_KEY = "operations.admission_state";
export const ADMISSION_REASON_KEY = "operations.admission_reason";
export const ADMISSION_UPDATED_KEY = "operations.admission_updated_at";
