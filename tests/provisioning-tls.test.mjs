import assert from "node:assert/strict";
import test from "node:test";

import {
  isLoopbackHost,
  provisioningSslConfig,
} from "../scripts/provisioning-tls.mjs";

function connection(value) {
  return new URL(value);
}

test("a remote host always verifies the certificate", () => {
  assert.deepEqual(
    provisioningSslConfig(
      connection("postgresql://user:secret@db.example.com:5432/app"),
      { env: {} },
    ),
    { rejectUnauthorized: true },
  );
});

test("an explicit CA is passed through with verification on", () => {
  const ca = "-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----";

  assert.deepEqual(
    provisioningSslConfig(
      connection("postgresql://user:secret@db.example.com:5432/app"),
      { env: { PROVISIONING_DATABASE_CA: ca } },
    ),
    { ca, rejectUnauthorized: true },
  );
});

test("a CA file is read and an unreadable file is refused without its path", () => {
  assert.throws(
    () =>
      provisioningSslConfig(
        connection("postgresql://user:secret@db.example.com:5432/app"),
        { env: { PROVISIONING_DATABASE_CA_FILE: "not-a-real-ca.pem" } },
      ),
    /PROVISIONING_DATABASE_CA_FILE could not be read/,
  );
});

test("both CA sources are refused", () => {
  assert.throws(
    () =>
      provisioningSslConfig(
        connection("postgresql://user:secret@db.example.com:5432/app"),
        {
          env: {
            PROVISIONING_DATABASE_CA: "inline",
            PROVISIONING_DATABASE_CA_FILE: "file.pem",
          },
        },
      ),
    /Set only one/,
  );
});

test("a remote host cannot disable TLS", () => {
  assert.throws(
    () =>
      provisioningSslConfig(
        connection(
          "postgresql://user:secret@db.example.com:5432/app?sslmode=disable",
        ),
        { env: {} },
      ),
    /sslmode=disable is refused/,
  );
});

test("a remote host cannot request an unverified TLS mode", () => {
  for (const mode of ["no-verify", "allow", "prefer"]) {
    assert.throws(
      () =>
        provisioningSslConfig(
          connection(
            `postgresql://user:secret@db.example.com:5432/app?sslmode=${mode}`,
          ),
          { env: {} },
        ),
      /Unverified TLS modes are refused/,
    );
  }
});

test("a remote require mode still verifies", () => {
  assert.deepEqual(
    provisioningSslConfig(
      connection(
        "postgresql://user:secret@db.example.com:5432/app?sslmode=require",
      ),
      { env: {} },
    ),
    { rejectUnauthorized: true },
  );
});

test("only loopback hosts receive the local exception", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("[::1]"), true);
  assert.equal(isLoopbackHost("db.example.com"), false);
  assert.equal(isLoopbackHost("127.0.0.1.example.com"), false);

  assert.equal(
    provisioningSslConfig(
      connection("postgresql://user:secret@127.0.0.1:5432/app?sslmode=disable"),
      { env: {} },
    ),
    undefined,
  );
  assert.equal(
    provisioningSslConfig(
      connection("postgresql://user:secret@localhost:5432/app"),
      { env: {} },
    ),
    undefined,
  );
});

test("a loopback require mode still verifies", () => {
  assert.deepEqual(
    provisioningSslConfig(
      connection("postgresql://user:secret@localhost:5432/app?sslmode=require"),
      { env: {} },
    ),
    { rejectUnauthorized: true },
  );
});
