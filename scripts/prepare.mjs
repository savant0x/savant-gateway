/**
 * Local checkout wiring, skipped when there is no `.git` directory.
 *
 * Vercel uploads the application without its Git metadata. The previous
 * `prepare` command ran `git config` unconditionally, so the install failed
 * with exit 128 before the build even started. Local installs still wire the
 * commit hook and message template; a deployment simply has nothing to wire.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".git")) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
  execFileSync("git", ["config", "commit.template", ".gitmessage"], {
    stdio: "ignore",
  });
}
