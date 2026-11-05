import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the committed Vercel schedule is one Hobby daily provider heartbeat", async () => {
  const config = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );

  assert.deepEqual(config.crons, [
    { path: "/api/cron/providers", schedule: "0 0 * * *" },
  ]);
});
