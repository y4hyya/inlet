import type { Hex } from "viem";

export const stellarDomain = 27;

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const accountVersion = 6 << 3;
const contractVersion = 2 << 3;

function checksum(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function fromBase32(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("not a Stellar address");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >> bits) & 31];
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

function decode(strkey: string, version: number, what: string): Hex {
  const raw = strkey.length === 56 ? fromBase32(strkey) : new Uint8Array();
  const payload = raw.slice(0, 33);
  if (raw.length !== 35 || raw[0] !== version || checksum(payload) !== (raw[33] | (raw[34] << 8))) throw new Error(`not a Stellar ${what}`);
  return `0x${Array.from(payload.slice(1), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function encode(value: Hex, version: number): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("expected 32 bytes");
  const payload = new Uint8Array(33);
  payload[0] = version;
  for (let at = 0; at < 32; at += 1) payload[at + 1] = parseInt(value.slice(2 + at * 2, 4 + at * 2), 16);
  const crc = checksum(payload);
  return toBase32(Uint8Array.from([...payload, crc & 0xff, crc >> 8]));
}

/// The 32 bytes an intent carries as its beneficiary on Stellar: the raw key of a G account, nothing else.
export function stellarAccountToBytes32(account: string): Hex {
  return decode(account.trim(), accountVersion, "account, which starts with G");
}

export function stellarContractToBytes32(contract: string): Hex {
  return decode(contract.trim(), contractVersion, "contract, which starts with C");
}

export function bytes32ToStellarAccount(value: Hex): string {
  return encode(value, accountVersion);
}

export function bytes32ToStellarContract(value: Hex): string {
  return encode(value, contractVersion);
}

export function isStellarAccount(text: string): boolean {
  try {
    stellarAccountToBytes32(text);
    return true;
  } catch {
    return false;
  }
}
