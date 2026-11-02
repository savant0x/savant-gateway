import { join } from "node:path";

import { seedContentSources } from "../lib/content/presets.ts";
import { createStorageDatabase } from "../lib/storage/database.ts";

const env = process.env;
const localDirectory = env.PG_LOCAL_PATH?.trim() || join(process.cwd(), "data", "pg");
const db = await createStorageDatabase({ env, localDirectory });

try {
  const result = await seedContentSources(db);

  if (result.created.length === 0) {
    console.log("No new sources: all presets already exist.");
  } else {
    console.log(`Created ${result.created.length} source(s):`);
    for (const label of result.created) console.log(`  + ${label}`);
  }

  if (result.skipped.length > 0) {
    console.log(`Skipped ${result.skipped.length} existing source(s):`);
    for (const label of result.skipped) console.log(`  = ${label}`);
  }
} finally {
  await db.close();
}
