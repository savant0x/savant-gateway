import { adminError, guardAdminApi, NO_STORE } from "@/lib/admin-auth";
import { readAlertTransportConfig } from "@/lib/alert-transport";
import { readJsonObject, requestBodyError } from "@/lib/request-limits";
import { listProviders, setProviderEnabled } from "@/lib/store";
import {
  acknowledgeOperationIncident,
  getAdmissionControl,
  getOperationsSnapshot,
  listOperationIncidents,
  runOperationsMonitor,
  setAdmissionState,
} from "@/lib/store/operations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function overview() {
  const transport = readAlertTransportConfig(process.env);

  return {
    snapshot: getOperationsSnapshot(),
    admission: getAdmissionControl(),
    incidents: listOperationIncidents(200),
    providers: listProviders().map((provider) => ({
      slug: provider.slug,
      label: provider.label,
      enabled: provider.enabled,
      status: provider.status,
    })),
    transport: {
      configured: transport.configured,
      problem: transport.configured ? null : transport.problem,
    },
  };
}

export async function GET(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  return Response.json(overview(), { headers: NO_STORE });
}

export async function POST(request: Request) {
  const blocked = await guardAdminApi(request);

  if (blocked) return blocked;

  let body: Record<string, unknown>;

  try {
    body = await readJsonObject(request);
  } catch (error) {
    return requestBodyError(error);
  }

  const action = typeof body.action === "string" ? body.action : "";

  if (action === "tick") {
    const tick = await runOperationsMonitor();

    return Response.json(
      {
        ok: true,
        tick: {
          active: tick.active,
          opened: tick.opened,
          reopened: tick.reopened,
          resolved: tick.resolved,
          delivered: tick.delivered,
          failed: tick.failed,
          unconfigured: tick.unconfigured,
        },
        ...overview(),
      },
      { headers: NO_STORE },
    );
  }

  if (action === "pause" || action === "drain" || action === "resume") {
    const state =
      action === "resume" ? "open" : action === "pause" ? "paused" : "draining";
    const result = setAdmissionState({
      state,
      reason: typeof body.reason === "string" ? body.reason : "",
    });

    if (!result.ok) return adminError(400, result.error);

    return Response.json({ ok: true, ...overview() }, { headers: NO_STORE });
  }

  if (action === "acknowledge") {
    const id = typeof body.id === "string" ? body.id.trim() : "";

    if (!id) return adminError(400, "An incident id is required.");

    const incident = acknowledgeOperationIncident(id);

    if (!incident) return adminError(404, "Incident not found.");

    return Response.json(
      { ok: true, incident, ...overview() },
      { headers: NO_STORE },
    );
  }

  if (action === "provider") {
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";

    if (!slug) return adminError(400, "A provider slug is required.");
    if (typeof body.enabled !== "boolean") {
      return adminError(400, "provider enabled must be a boolean.");
    }

    if (!setProviderEnabled(slug, body.enabled)) {
      return adminError(404, "Provider not found.");
    }

    return Response.json({ ok: true, ...overview() }, { headers: NO_STORE });
  }

  return adminError(
    400,
    "Unknown action. Use tick, pause, drain, resume, acknowledge or provider.",
  );
}
