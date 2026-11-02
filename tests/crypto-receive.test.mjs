import assert from "node:assert/strict";
import test from "node:test";

import {
  USDC_DERIVATION_PATH,
  addressFromPublicKey,
  deriveAddressFromAccount,
  deriveAddressFromXpub,
  rootFromMnemonic,
  rootFromSeed,
  seedFromMnemonic,
  usdcAccount,
} from "../lib/crypto/derive.ts";
import {
  TRANSFER_TOPIC,
  atSink,
  decodeTransfer,
  isConfirmed,
  paymentKey,
  transferTopic,
} from "../lib/crypto/transfer.ts";

const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";
const ROOT = rootFromMnemonic(TEST_MNEMONIC);
const ACCOUNT = usdcAccount(ROOT);
const XPUB = ACCOUNT.publicExtendedKey;
const HARDHAT_ADDRESSES = [
  "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
  "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
];
const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";
const OUR_ADDRESS = "0x3333333333333333333333333333333333333333";

function topicFor(address) {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function transferLog({
  from = FROM,
  to = TO,
  amount = 25_000_000n,
  topic = TRANSFER_TOPIC,
} = {}) {
  return {
    topics: [topic, topicFor(from), topicFor(to)],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
  };
}

test("seed derivation matches the published Hardhat vector", () => {
  assert.equal(USDC_DERIVATION_PATH, "m/44'/60'/0'/0");
  assert.deepEqual(
    HARDHAT_ADDRESSES.map((_, index) =>
      deriveAddressFromAccount(ACCOUNT, index),
    ),
    HARDHAT_ADDRESSES,
  );
});

test("the seed is deterministic and rejects empty or short input", () => {
  const first = seedFromMnemonic(TEST_MNEMONIC);
  const again = seedFromMnemonic(TEST_MNEMONIC);

  assert.equal(first.length, 64);
  assert.deepEqual(first, again);
  assert.throws(() => seedFromMnemonic("   "), /non-empty/);
  assert.throws(() => rootFromSeed(new Uint8Array(8)), /at least 16 bytes/);
});

test("an xpub alone derives the same addresses as the account", () => {
  for (const index of [0, 1, 2, 7, 42]) {
    assert.equal(
      deriveAddressFromXpub(XPUB, index),
      deriveAddressFromAccount(ACCOUNT, index),
    );
  }
});

test("a private extended key is refused where an xpub is required", () => {
  assert.match(ROOT.privateExtendedKey, /^xprv/);
  assert.throws(
    () => deriveAddressFromXpub(ROOT.privateExtendedKey, 0),
    /xpub, not an xpriv/,
  );
});

test("an unparseable xpub is reported, not silently derived", () => {
  assert.throws(
    () => deriveAddressFromXpub("xpub-not-a-key", 0),
    /invalid extended public key/,
  );
  assert.throws(() => deriveAddressFromXpub("  ", 0), /non-empty/);
});

test("addresses are stable and unique per index", () => {
  assert.equal(
    deriveAddressFromXpub(XPUB, 42),
    deriveAddressFromXpub(XPUB, 42),
  );

  const addresses = Array.from({ length: 25 }, (_, index) =>
    deriveAddressFromXpub(XPUB, index),
  );

  assert.equal(new Set(addresses).size, 25);
});

test("out-of-range derivation indexes are rejected", () => {
  for (const index of [-1, 0.5, 2 ** 31, Number.NaN, Infinity]) {
    assert.throws(
      () => deriveAddressFromXpub(XPUB, index),
      /derivation index/,
    );
  }
});

test("only compressed public keys are accepted", () => {
  assert.throws(
    () => addressFromPublicKey(new Uint8Array(32)),
    /33-byte compressed/,
  );

  const address = addressFromPublicKey(ACCOUNT.deriveChild(0).publicKey);

  assert.equal(address, HARDHAT_ADDRESSES[0]);
  assert.equal(address.length, 42);
});

test("the Transfer topic is computed, not trusted", () => {
  assert.equal(transferTopic(), TRANSFER_TOPIC);
  assert.equal(
    TRANSFER_TOPIC,
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  );
});

test("a Transfer log decodes to the exact integer amount", () => {
  const decoded = decodeTransfer(transferLog());

  assert.equal(decoded.from, FROM);
  assert.equal(decoded.to, TO);
  assert.equal(decoded.amount, 25_000_000n);
  assert.equal(decoded.amount, 25n * 10n ** 6n);
});

test("a transfer is ours only when it pays our address", () => {
  const log = transferLog({ to: OUR_ADDRESS });

  assert.equal(atSink(log, OUR_ADDRESS), true);
  assert.equal(atSink(log, OUR_ADDRESS.toUpperCase()), true);
  assert.equal(atSink(transferLog({ to: TO }), OUR_ADDRESS), false);
});

test("malformed Transfer logs are rejected and never counted as ours", () => {
  const good = transferLog();
  const malformed = [
    { ...good, topics: [TRANSFER_TOPIC, good.topics[1]] },
    { ...good, topics: ["0xdeadbeef", good.topics[1], good.topics[2]] },
    { ...good, topics: [TRANSFER_TOPIC, "0x12", good.topics[2]] },
    { ...good, data: "0x01" },
    { ...good, data: `0x${"zz".repeat(32)}` },
  ];

  for (const log of malformed) {
    assert.throws(() => decodeTransfer(log), /Transfer log/);
    assert.equal(atSink(log, OUR_ADDRESS), false);
  }
});

test("credit is gated on confirmation depth, with inclusion as the first", () => {
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 99, depth: 12 }),
    false,
  );
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 100, depth: 12 }),
    false,
  );
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 110, depth: 12 }),
    false,
  );
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 111, depth: 12 }),
    true,
  );
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 400, depth: 12 }),
    true,
  );
  assert.equal(
    isConfirmed({ seenBlock: 100, headBlock: 100, depth: 1 }),
    true,
  );
});

test("a zero, fractional or missing depth is rejected", () => {
  for (const depth of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => isConfirmed({ seenBlock: 100, headBlock: 100, depth }),
      /positive integer/,
    );
  }

  assert.throws(
    () => isConfirmed({ seenBlock: -1, headBlock: 100, depth: 12 }),
    /seenBlock/,
  );
  assert.throws(
    () => isConfirmed({ seenBlock: 100, headBlock: 1.5, depth: 12 }),
    /headBlock/,
  );
});

test("payment keys are stable and distinct across log and chain", () => {
  assert.equal(
    paymentKey({ chainId: 8453, txHash: "0xABC", logIndex: 0 }),
    "8453:0xabc:0",
  );
  assert.equal(
    paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 0 }),
    "8453:0xabc:0",
  );
  assert.notEqual(
    paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 0 }),
    paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 1 }),
  );
  assert.notEqual(
    paymentKey({ chainId: 8453, txHash: "0xabc", logIndex: 0 }),
    paymentKey({ chainId: 137, txHash: "0xabc", logIndex: 0 }),
  );
});

test("malformed payment identities are rejected", () => {
  const malformed = [
    { chainId: 0, txHash: "0xabc", logIndex: 0 },
    { chainId: 1.5, txHash: "0xabc", logIndex: 0 },
    { chainId: 8453, txHash: "abc", logIndex: 0 },
    { chainId: 8453, txHash: "0xzz", logIndex: 0 },
    { chainId: 8453, txHash: "0xabc", logIndex: -1 },
  ];

  for (const identity of malformed) {
    assert.throws(() => paymentKey(identity), /(chainId|txHash|logIndex)/);
  }
});
