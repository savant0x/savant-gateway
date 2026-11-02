import { pbkdf2Sync } from "node:crypto";

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { HDKey } from "@scure/bip32";

export const USDC_DERIVATION_PATH = "m/44'/60'/0'/0";

/** BIP32 non-hardened child indexes are 31 bits. */
const MAX_DERIVATION_INDEX = 0x7fffffff;

function assertIndex(index: number): void {
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index > MAX_DERIVATION_INDEX
  ) {
    throw new Error(
      `derivation index must be an integer from 0 to ${MAX_DERIVATION_INDEX}`,
    );
  }
}

/**
 * BIP39 seed: PBKDF2-HMAC-SHA512, 2048 rounds, salt `mnemonic` + passphrase.
 * The receive lane keeps only an xpub in production; this is for the offline
 * vector and for account setup on a machine the operator controls.
 */
export function seedFromMnemonic(
  mnemonic: string,
  passphrase = "",
): Uint8Array {
  if (typeof mnemonic !== "string" || mnemonic.trim().length === 0) {
    throw new Error("mnemonic must be a non-empty string");
  }

  return pbkdf2Sync(
    mnemonic.normalize("NFKD"),
    `mnemonic${passphrase.normalize("NFKD")}`,
    2048,
    64,
    "sha512",
  );
}

export function rootFromSeed(seed: Uint8Array): HDKey {
  if (!(seed instanceof Uint8Array) || seed.length < 16) {
    throw new Error("seed must be at least 16 bytes");
  }

  return HDKey.fromMasterSeed(seed);
}

export function rootFromMnemonic(mnemonic: string, passphrase = ""): HDKey {
  return rootFromSeed(seedFromMnemonic(mnemonic, passphrase));
}

/** The account node whose children are invoice addresses. */
export function usdcAccount(root: HDKey): HDKey {
  return root.derive(USDC_DERIVATION_PATH);
}

/**
 * Derive the lowercase Ethereum address for one compressed secp256k1 public
 * key. EIP-55 checksum casing is presentation only and is not applied here.
 */
export function addressFromPublicKey(compressed: Uint8Array): string {
  if (!(compressed instanceof Uint8Array) || compressed.length !== 33) {
    throw new Error("public key must be a 33-byte compressed secp256k1 key");
  }

  // The v2 type declares `fromBytes` as affine, so serialize x and y directly
  // instead of relying on `toBytes(false)`, which only the runtime exposes.
  const point = secp256k1.Point.fromBytes(compressed);
  const x = point.x.toString(16).padStart(64, "0");
  const y = point.y.toString(16).padStart(64, "0");
  const hash = keccak_256(hexToBytes(`${x}${y}`));

  return `0x${bytesToHex(hash.slice(12))}`;
}

export function deriveAddressFromAccount(
  account: HDKey,
  index: number,
): string {
  assertIndex(index);

  const publicKey = account.deriveChild(index).publicKey;

  if (!publicKey) throw new Error("derived child has no public key");

  return addressFromPublicKey(publicKey);
}

/**
 * Derive the same address from an xpub alone. An xpriv is rejected: the
 * server must never need a spending key to know where money lands.
 */
export function deriveAddressFromXpub(xpub: string, index: number): string {
  assertIndex(index);

  if (typeof xpub !== "string" || xpub.trim().length === 0) {
    throw new Error("xpub must be a non-empty string");
  }

  let node: HDKey;

  try {
    node = HDKey.fromExtendedKey(xpub.trim());
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    throw new Error(`invalid extended public key: ${detail}`);
  }

  if (node.privateKey !== null) {
    throw new Error("deriveAddressFromXpub requires an xpub, not an xpriv");
  }

  return deriveAddressFromAccount(node, index);
}
