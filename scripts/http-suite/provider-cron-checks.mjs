import assert from "node:assert/strict";

/**
 * HTTP probes for the scheduled provider heartbeat (FID-2026-1105-004).
 *
 * The fixture is disposable: one provider whose mock catalog is an explicit
 * `data: []` is the only due row, so `attempted` is unambiguous. `mock` and
 * `alloc` are pinned fresh first because an empty-catalog sync on them would
 * delist `mock-paid` and break every later catalog check. The mock mode and the
 * pinned timestamps are restored, and the fixture provider is deleted, in
 * `finally`.
 */
export async function runProviderCronChecks({ baseUrl, db, secret, mock }) {
  const SLUG = "cron";
  const KEY_ENV_VAR = "HTTP_SUITE_PROVIDER_KEY";
  const UNSET_KEY_ENV_VAR = "HTTP_SUITE_UNSET_PROVIDER_KEY";

  const readProvider = (slug) =>
    db
      .prepare(
        "SELECT enabled, key_env_var, synced_at FROM providers WHERE slug = ?",
      )
      .get(slug);

  const call = (options = {}) =>
    fetch(`${baseUrl}/api/cron/providers`, {
      method: options.method ?? "GET",
      headers: options.headers ?? {},
    });

  const originalSyncedAt = new Map();

  for (const slug of ["mock", "alloc"]) {
    originalSyncedAt.set(slug, (await readProvider(slug))?.synced_at ?? null);
  }

  try {
    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT INTO providers
          (slug, label, kind, base_url, key_env_var, default_headers,
           supports_balance, supports_subscription, supports_pricing,
           enabled, sort_order, status, created_at, updated_at, synced_at)
         VALUES (?, 'HTTP Suite Cron', 'openai', ?, ?, '{}',
           0, 0, 0, 1, 9, 'active', ?, ?, NULL)`,
      )
      .run(SLUG, mock.baseUrl, KEY_ENV_VAR, now, now);

    // Not due: the scheduler must not touch the seeded providers, whose mock
    // catalog is about to become empty.
    for (const slug of ["mock", "alloc"]) {
      await db
        .prepare("UPDATE providers SET synced_at = ? WHERE slug = ?")
        .run(now, slug);
    }

    const anonymous = await call();

    assert.equal(
      anonymous.status,
      401,
      "a heartbeat without the configured secret must be rejected",
    );
    assert.equal(anonymous.headers.get("cache-control"), "no-store");

    const wrong = await call({
      headers: { authorization: "Bearer not-the-configured-secret" },
    });

    assert.equal(wrong.status, 401, "a wrong secret must be rejected");

    mock.state.catalog.mode = "empty";

    const first = await call({
      headers: { authorization: `Bearer ${secret}` },
    });

    assert.equal(first.status, 200, "GET with the configured secret must run");
    const firstBody = await first.json();

    assert.deepEqual(
      firstBody.attempted,
      [SLUG],
      "the scheduler attempts exactly the due, configured provider",
    );
    assert.equal(firstBody.intervalHours, 6);

    const cron = firstBody.providers?.find((row) => row.slug === SLUG);

    assert.ok(cron, "the response reports the fixture provider");
    assert.equal(cron.enabled, true);
    assert.equal(cron.configured, true);
    assert.equal(cron.modelCount, 0, "an empty catalog imports no models");
    assert.ok(
      cron.syncedAt,
      "a successful empty sync advances the reported timestamp",
    );
    assert.ok(
      (await readProvider(SLUG)).synced_at,
      "the provider row records the successful sync",
    );

    // POST and the provider-specific header are the other accepted contract.
    const second = await call({
      method: "POST",
      headers: { "x-provider-secret": secret },
    });

    assert.equal(
      second.status,
      200,
      "POST with the configured secret must run",
    );
    assert.deepEqual(
      (await second.json()).attempted,
      [],
      "an immediate second tick is not due even for a forced scheduler call",
    );

    await db
      .prepare(
        "UPDATE providers SET enabled = 0, synced_at = NULL WHERE slug = ?",
      )
      .run(SLUG);

    const beforeDisabled = mock.state.catalog.requests;
    const disabled = await call({
      headers: { authorization: `Bearer ${secret}` },
    });

    assert.equal(disabled.status, 200);
    assert.deepEqual(
      (await disabled.json()).attempted,
      [],
      "a disabled provider is not attempted",
    );
    assert.equal(
      mock.state.catalog.requests,
      beforeDisabled,
      "a disabled provider makes no upstream catalog call",
    );

    await db
      .prepare(
        "UPDATE providers SET enabled = 1, key_env_var = ?, synced_at = NULL WHERE slug = ?",
      )
      .run(UNSET_KEY_ENV_VAR, SLUG);

    const keyless = await call({
      headers: { authorization: `Bearer ${secret}` },
    });

    assert.equal(keyless.status, 200);
    const keylessBody = await keyless.json();

    assert.deepEqual(
      keylessBody.attempted,
      [],
      "a provider without a configured key is not attempted",
    );
    assert.equal(
      keylessBody.providers?.find((row) => row.slug === SLUG)?.configured,
      false,
      "the summary reports the missing key instead of pretending it can sync",
    );

    await db
      .prepare(
        "UPDATE providers SET key_env_var = ?, synced_at = NULL WHERE slug = ?",
      )
      .run(KEY_ENV_VAR, SLUG);

    mock.state.catalog.mode = "malformed";

    const failed = await call({
      headers: { authorization: `Bearer ${secret}` },
    });

    assert.equal(
      failed.status,
      200,
      "a provider failure is a per-provider result, not a scheduler failure",
    );
    assert.deepEqual(
      (await failed.json()).attempted,
      [SLUG],
      "a due provider is still reported as attempted when its sync fails",
    );
    assert.equal(
      (await readProvider(SLUG))?.synced_at,
      null,
      "a failed sync does not advance the provider timestamp",
    );

    console.log("http-suite: provider scheduler contract PASS");
  } finally {
    mock.state.catalog.mode = "unavailable";

    await db
      .prepare("DELETE FROM provider_sync_leases WHERE slug = ?")
      .run(SLUG);
    await db.prepare("DELETE FROM models WHERE upstream_slug = ?").run(SLUG);
    await db.prepare("DELETE FROM providers WHERE slug = ?").run(SLUG);

    for (const [slug, syncedAt] of originalSyncedAt) {
      if (syncedAt === null) {
        await db
          .prepare("UPDATE providers SET synced_at = NULL WHERE slug = ?")
          .run(slug);
      } else {
        await db
          .prepare("UPDATE providers SET synced_at = ? WHERE slug = ?")
          .run(syncedAt, slug);
      }
    }
  }
}
