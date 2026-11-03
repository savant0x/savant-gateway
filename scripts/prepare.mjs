/**
 * Local checkout wiring, skipped on a deployment.
 *
 * A CLI upload has no `.git` directory; a Git-connected Vercel build does, but
 * its checkout is not a writable repository. Both deployments must skip the
 * hook wiring. The previous command ran `git config` unconditionally, so the
 * install failed with exit 128 before the build started. Local installs still
 * wire the commit hook and message template.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const isDeployment = Boolean(process.env.VERCEL) || Boolean(process.env.CI);

if (!isDeployment && existsSync(".git")) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
    stdio: "ignore",
  });
  execFileSync("git", ["config", "commit.template", ".gitmessage"], {
    stdio: "ignore",
  });
}
