import "server-only";

import { createHash, randomBytes } from "node:crypto";

export function hashApiKey(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey() {
  const secret = `sk-${randomBytes(32).toString("hex")}`;
  const prefix = `${secret.slice(0, 8)}…${secret.slice(-4)}`;

  return { secret, prefix, secretHash: hashApiKey(secret) };
}
