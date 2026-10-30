export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness only: the process can answer. It deliberately makes no claim about
 * the database, configuration or upstream capacity; `/api/ready` does that.
 */
export async function GET() {
  return Response.json(
    { status: "alive" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
