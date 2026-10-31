import type {
  AdmissionState,
  OperationsIncident,
  OperationsSnapshot,
} from "@/lib/operations";

export type OperationsOverview = {
  snapshot: OperationsSnapshot;
  admission: {
    state: AdmissionState;
    reason: string | null;
    updatedAt: string | null;
  };
  incidents: OperationsIncident[];
  providers: Array<{
    slug: string;
    label: string;
    enabled: boolean;
    status: string;
  }>;
  transport: {
    configured: boolean;
    problem: string | null;
  };
};

export const ADMISSION_COPY: Record<AdmissionState, string> = {
  open: "New inference is admitted.",
  paused:
    "New inference is refused. Payment webhooks, settlement and the console remain available.",
  draining: "New inference is refused while in-flight calls finish and settle.",
};

export function admissionColor(state: AdmissionState) {
  return state === "open" ? "success" : "warning";
}
