import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

const TRANSFER_SIGNATURE = "Transfer(address,address,uint256)";

/** keccak256 of the canonical ERC-20 Transfer event signature. */
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const HEX_32_BYTES = /^0x[0-9a-fA-F]{64}$/;
const TX_HASH_PATTERN = /^0x[0-9a-fA-F]+$/;

export type TransferLog = {
  readonly topics: readonly string[];
  readonly data: string;
};

export type DecodedTransfer = {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
};

/** Compute the topic from the signature so the constant can be checked. */
export function transferTopic(): string {
  const encoded = new TextEncoder().encode(TRANSFER_SIGNATURE);

  return `0x${bytesToHex(keccak_256(encoded))}`;
}

function topicAddress(topic: string): string {
  if (!HEX_32_BYTES.test(topic)) {
    throw new Error("Transfer log topic must be 32 bytes of hex");
  }

  return `0x${topic.slice(-40)}`.toLowerCase();
}

/**
 * Decode one ERC-20 Transfer log. Addresses come back lowercase; the amount is
 * the exact base-unit integer, never a float or a dollars value.
 */
export function decodeTransfer(log: TransferLog): DecodedTransfer {
  if (!Array.isArray(log.topics) || log.topics.length < 3) {
    throw new Error("Transfer log is missing indexed from/to");
  }

  const topic0 = log.topics[0];

  if (typeof topic0 !== "string" || topic0.toLowerCase() !== TRANSFER_TOPIC) {
    throw new Error("not a Transfer log");
  }

  if (typeof log.data !== "string" || !HEX_32_BYTES.test(log.data)) {
    throw new Error("Transfer log amount must be 32 bytes of hex");
  }

  return {
    from: topicAddress(log.topics[1]),
    to: topicAddress(log.topics[2]),
    amount: BigInt(log.data),
  };
}

/**
 * True only when the log decodes and pays our address. A malformed log is not
 * ours rather than a reason to stop reading the block.
 */
export function atSink(log: TransferLog, ourAddress: string): boolean {
  try {
    return decodeTransfer(log).to === ourAddress.toLowerCase();
  } catch {
    return false;
  }
}

export type ConfirmationInput = {
  readonly seenBlock: number;
  readonly headBlock: number;
  readonly depth: number;
};

function assertBlock(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

/** Inclusion at `seenBlock` counts as the first confirmation. */
export function isConfirmed({
  seenBlock,
  headBlock,
  depth,
}: ConfirmationInput): boolean {
  assertBlock(seenBlock, "seenBlock");
  assertBlock(headBlock, "headBlock");

  if (!Number.isSafeInteger(depth) || depth < 1) {
    throw new Error("confirmation depth must be a positive integer");
  }

  if (headBlock < seenBlock) return false;

  return headBlock - seenBlock + 1 >= depth;
}

export type PaymentIdentity = {
  readonly chainId: number;
  readonly txHash: string;
  readonly logIndex: number;
};

/**
 * The settlement idempotency key. One log has exactly one key, and the same
 * hash on another chain is a different payment.
 */
export function paymentKey({
  chainId,
  txHash,
  logIndex,
}: PaymentIdentity): string {
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    throw new Error("chainId must be a positive integer");
  }

  if (typeof txHash !== "string" || !TX_HASH_PATTERN.test(txHash)) {
    throw new Error("txHash must be 0x-prefixed hex");
  }

  if (!Number.isSafeInteger(logIndex) || logIndex < 0) {
    throw new Error("logIndex must be a non-negative integer");
  }

  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}
