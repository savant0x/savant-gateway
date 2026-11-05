import assert from "node:assert/strict";

/**
 * Shared HTTP probes for the content heartbeat (FID-2026-1104-015).
 *
 * Run before `runChecks`, which deliberately destroys a required table. These
 * probes are read-only for catalog state and add only fetch-run receipts.
 */
export async function runContentChecks({ baseUrl, db, secret }) {
  const unauthorized = await fetch(`${baseUrl}/api/cron/content`, {
    method: "GET",
  });

  assert.equal(
    unauthorized.status,
    401,
    "a heartbeat without the configured secret must be rejected",
  );

  const getResponse = await fetch(`${baseUrl}/api/cron/content`, {
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
  });

  assert.equal(getResponse.status, 200, "GET heartbeat must be accepted");
  const getBody = await getResponse.json();
  assert.equal(getBody.paused, false);
  assert.equal(getBody.status, "ok");
  assert.match(getBody.runId, /^[0-9a-f-]{36}$/i);

  const postResponse = await fetch(`${baseUrl}/api/cron/content`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });

  assert.equal(postResponse.status, 200, "POST heartbeat must be accepted");
  const postBody = await postResponse.json();
  assert.equal(postBody.paused, false);
  assert.match(postBody.runId, /^[0-9a-f-]{36}$/i);
  assert.notEqual(postBody.runId, getBody.runId);

  const rows = await db.query(
    `SELECT id, status, trigger FROM content.fetch_runs
      WHERE id = ANY($1)`,
    [[getBody.runId, postBody.runId]],
  );

  assert.equal(rows.length, 2, "both heartbeat receipts must be durable");
  assert.ok(rows.every((row) => row.status === "ok"));
  assert.ok(rows.every((row) => row.trigger === "scheduled"));
}
