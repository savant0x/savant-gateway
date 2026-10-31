#!/usr/bin/env node
/**
 * Capability spike for direct-to-wallet USDC receipt (FID-068, step 0).
 *
 * Proves the five mechanisms the receive lane depends on, entirely offline:
 * no RPC, no network, no private key, no funds. The mnemonic below is the
 * universally published Hardhat test vector — it is not a secret and holds
 * nothing.
 *
 * What must be true before any of this touches the money path:
 *
 *   1. Address derivation matches a known vector, so we are not inventing keys.
 *   2. An xpub alone derives the same addresses, so the server never needs a
 *      spending key to know where money lands.
 *   3. Derived addresses are unique per top-up and stable across calls.
 *   4. An ERC-20 Transfer log decodes to the exact integer amount.
 *   5. Credit is gated on confirmation depth, never on first sighting.
 */
import { pbkdf2Sync } from "node:crypto";

const checks = [];

function check(name, fn) {
  try {
    const detail = fn();

    checks.push({ name, ok: true, detail: detail ?? "" });

    return true;
  } catch (error) {
    checks.push({ name, ok: false, detail: error.message });

    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Resolve a noble module across v1/v2 subpath conventions. */
async function load(specifiers, key) {
  for (const specifier of specifiers) {
    try {
      const module = await import(specifier);

      if (module[key]) return module;
    } catch {
      // Try the next candidate; the failure is reported by the caller.
    }
  }

  throw new Error(`none of ${specifiers.join(", ")} exports ${key}`);
}

const { HDKey } = await load(["@scure/bip32"], "HDKey");
const sha3 = await load(["@noble/hashes/sha3", "@noble/hashes/sha3.js"], "keccak_256");
const secp = await load(["@noble/curves/secp256k1", "@noble/curves/secp256k1.js"], "secp256k1");

const keccak256 = sha3.keccak_256;
const Point = secp.secp256k1.Point ?? secp.secp256k1.ProjectivePoint;

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const DERIVATION_PATH = "m/44'/60'/0'/0";

/** BIP39 seed: PBKDF2-HMAC-SHA512, 2048 rounds, salt "mnemonic"+passphrase. */
function seedFromMnemonic(mnemonic, passphrase = "") {
  return pbkdf2Sync(
    mnemonic.normalize("NFKD"),
    `mnemonic${passphrase.normalize("NFKD")}`,
    2048,
    64,
    "sha512",
  );
}

/**
 * EIP-55 is presentation only; comparison is case-insensitive here. The point
 * API differs between the curves v1 (`fromHex`/`toRawBytes`) and v2
 * (`fromBytes`/`toBytes`) layouts, so both are accepted rather than pinning the
 * spike to one version.
 */
function addressFromPublicKey(compressed) {
  const bytes = Buffer.from(compressed);
  const point = Point.fromBytes
    ? Point.fromBytes(bytes)
    : Point.fromHex(bytes.toString("hex"));
  const uncompressed =
    typeof point.toBytes === "function"
      ? point.toBytes(false)
      : point.toRawBytes(false);
  const hash = keccak256(uncompressed.slice(1));

  return `0x${Buffer.from(hash.slice(12)).toString("hex")}`;
}

function deriveFromXpub(xpub, index) {
  return addressFromPublicKey(HDKey.fromExtendedKey(xpub).deriveChild(index).publicKey);
}

const root = HDKey.fromMasterSeed(seedFromMnemonic(TEST_MNEMONIC));
const account = root.derive(DERIVATION_PATH);
const xpub = account.publicExtendedKey;

// 1 — derivation matches the published Hardhat vector at indexes 0 and 1.
check("derivation matches a known vector", () => {
  const expected = [
    "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
    "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  ];

  const actual = [0, 1].map((i) =>
    addressFromPublicKey(account.deriveChild(i).publicKey).toLowerCase(),
  );

  assert(
    actual[0] === expected[0],
    `index 0 derived ${actual[0]}, expected ${expected[0]}`,
  );
  assert(
    actual[1] === expected[1],
    `index 1 derived ${actual[1]}, expected ${expected[1]}`,
  );

  const third = addressFromPublicKey(account.deriveChild(2).publicKey);

  return `index 0 and 1 match; index 2 = ${third} (informational)`;
});

// 2 — the xpub alone reproduces the same addresses.
check("xpub alone derives identical addresses", () => {
  for (const index of [0, 1, 2, 7]) {
    const fromSeed = addressFromPublicKey(account.deriveChild(index).publicKey);
    const fromXpub = deriveFromXpub(xpub, index);

    assert(
      fromSeed === fromXpub,
      `index ${index}: xpub gave ${fromXpub}, seed gave ${fromSeed}`,
    );
  }

  return "indexes 0, 1, 2 and 7 agree; server needs no private key";
});

// 3 — addresses are unique per index and stable when derived twice.
check("addresses are unique and stable", () => {
  const first = deriveFromXpub(xpub, 42);
  const again = deriveFromXpub(xpub, 42);
  const other = deriveFromXpub(xpub, 43);

  assert(first === again, "the same index produced two different addresses");
  assert(first !== other, "two indexes produced the same address");

  const seen = new Set(
    Array.from({ length: 25 }, (_, i) => deriveFromXpub(xpub, i)),
  );

  assert(seen.size === 25, `25 indexes produced only ${seen.size} addresses`);

  return "stable per index, 25/25 distinct";
});

// 4 — Transfer log decoding, against the real topic hash rather than a guess.
check("Transfer log decoding is exact", () => {
  const topic0 = `0x${Buffer.from(
    keccak256(new TextEncoder().encode("Transfer(address,address,uint256)")),
  ).toString("hex")}`;

  assert(
    topic0 === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
    `computed Transfer topic ${topic0} is not the canonical constant`,
  );

  const from = "0x1111111111111111111111111111111111111111";
  const to = "0x2222222222222222222222222222222222222222";
  const pad = (a) => `0x${a.slice(2).padStart(64, "0")}`;
  const log = {
    topics: [topic0, pad(from), pad(to)],
    data: `0x${(25_000_000n).toString(16).padStart(64, "0")}`,
  };

  const decoded = decodeTransfer(log);

  assert(decoded.from.toLowerCase() === from, `from decoded as ${decoded.from}`);
  assert(decoded.to.toLowerCase() === to, `to decoded as ${decoded.to}`);
  assert(decoded.amount === 25_000_000n, `amount decoded as ${decoded.amount}`);
  // USDC has 6 decimals: 25_000_000 base units is exactly $25.00.
  assert(decoded.amount === 25n * 10n ** 6n, "amount is not exactly $25.00");

  assert(
    atSink(log, "0x3333333333333333333333333333333333333333") === false,
    "a log paying someone else was accepted for our address",
  );

  return "topic constant verified; $25.00 decoded exactly; foreign payee rejected";
});

// 5 — depth gating: sighting is not confirmation.
check("credit is gated on confirmation depth", () => {
  const depth = 12;

  assert(!isConfirmed({ seenBlock: 100, headBlock: 100, depth }), "same-block sighting credited");
  assert(!isConfirmed({ seenBlock: 100, headBlock: 110, depth }), "11 confirmations credited at depth 12");
  assert(isConfirmed({ seenBlock: 100, headBlock: 111, depth }), "12 confirmations not credited");
  assert(isConfirmed({ seenBlock: 100, headBlock: 400, depth }), "400 confirmations not credited");
  assert(!isConfirmed({ seenBlock: 100, headBlock: 99, depth }), "a head behind the log credited");

  return "1, 11, 12 and 300 confirmations behave correctly at depth 12";
});

// 6 — idempotency key shape, unique per log inside a transaction.
check("idempotency key is unique per log", () => {
  const a = paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 0 });
  const b = paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 1 });
  const c = paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 0 });
  const otherChain = paymentKey({ chainId: 137, txHash: "0xabc", logIndex: 0 });

  assert(a === c, "the same log produced two different keys");
  assert(a !== b, "two logs in one tx shared a key");
  assert(a !== otherChain, "the same tx hash on two chains shared a key");
  assert(a === "8453:0xabc:0", `unexpected key shape: ${a}`);

  return "stable, and distinct across log index and chain";
});

// --- the pure functions under test -----------------------------------------

function decodeTransfer(log) {
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) {
    throw new Error("not a Transfer log");
  }

  if (log.topics.length < 3) {
    throw new Error("Transfer log is missing indexed from/to");
  }

  const topicAddress = (topic) => `0x${topic.slice(-40)}`;
  const amount = BigInt(`0x${log.data.slice(2, 66)}`);

  return {
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    amount,
  };
}

function atSink(log, ourAddress) {
  try {
    return decodeTransfer(log).to.toLowerCase() === ourAddress.toLowerCase();
  } catch {
    return false;
  }
}

/** Inclusion counts as the first confirmation. */
function isConfirmed({ seenBlock, headBlock, depth }) {
  if (headBlock < seenBlock) return false;

  return headBlock - seenBlock + 1 >= depth;
}

function paymentKey({ chainId, txHash, logIndex }) {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}

// --- report ----------------------------------------------------------------

for (const entry of checks) {
  console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name} — ${entry.detail}`);
}

const passed = checks.filter((entry) => entry.ok).length;

console.log(`\nusdc-receive-spike: ${passed}/${checks.length} checks pass`);

process.exit(passed === checks.length ? 0 : 1);
