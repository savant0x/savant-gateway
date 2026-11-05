import assert from "node:assert/strict";

/**
 * Shared HTTP probes for the content heartbeat (FID-2026-1104-015).
 *
 * Run before `runChecks`, which deliberately destroys a required table. These
 * probes are read-only for catalog state and add only fetch-run receipts.
 */
export async function runContentChecks({ baseUrl, db, secret, adminPassword }) {
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

  const login = await fetch(`${baseUrl}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const headers = { cookie, origin: baseUrl, "content-type": "application/json" };
  const policyResponse = await fetch(`${baseUrl}/api/admin/content/matching`, { headers });
  assert.equal(policyResponse.status, 200);
  const current = await policyResponse.json();
  const updated = await fetch(`${baseUrl}/api/admin/content/matching`, {
    method: "PATCH", headers,
    body: JSON.stringify({ expectedRevision: current.policy.revision, matchYouTubeDescriptions: false }),
  });
  assert.equal(updated.status, 200);
  const saved = await updated.json();
  assert.equal(saved.policy.matchYouTubeDescriptions, false);
  const rematch = await fetch(`${baseUrl}/api/admin/content/rematch`, {
    method: "POST", headers, body: JSON.stringify({ limit: 10 }),
  });
  assert.equal(rematch.status, 200);
  const restored = await fetch(`${baseUrl}/api/admin/content/matching`, {
    method: "PATCH", headers,
    body: JSON.stringify({ expectedRevision: saved.policy.revision, matchYouTubeDescriptions: true }),
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).policy.matchYouTubeDescriptions, true);
  console.log("http-suite: description matching policy and rematch PASS");
}
