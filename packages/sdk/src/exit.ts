import { encodeAbiParameters, hashTypedData, parseAbi, type Address, type Hex } from "viem";
import type { BurnFee } from "./circle.js";
import type { ExitIntent, ExitLegRecord, ExitRecord, ExitState } from "./types.js";

export const exitTypes = {
  ExitIntent: [
    { name: "owner", type: "address" },
    { name: "adapterId", type: "bytes32" },
    { name: "adapterData", type: "bytes" },
    { name: "amount", type: "uint256" },
    { name: "minAssets", type: "uint256" },
    { name: "legs", type: "ExitLeg[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "maxFeeBps", type: "uint16" },
  ],
  ExitLeg: [
    { name: "domain", type: "uint32" },
    { name: "recipient", type: "bytes32" },
    { name: "amount", type: "uint256" },
  ],
} as const;

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const cometAuthorizationTypes = {
  Authorization: [
    { name: "owner", type: "address" },
    { name: "manager", type: "address" },
    { name: "isAllowed", type: "bool" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
} as const;

export const permitAbi = parseAbi([
  "function nonces(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function previewWithdraw(uint256 assets) view returns (uint256)",
  "function previewRedeem(uint256 shares) view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function maxRedeem(address owner) view returns (uint256)",
]);

export const cometAbi = parseAbi([
  "function userNonce(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
]);

export function exitTypedData(intent: ExitIntent, exitContract: Address, chainId: number) {
  return {
    domain: { name: "InletExit", version: "1", chainId, verifyingContract: exitContract },
    types: exitTypes,
    primaryType: "ExitIntent" as const,
    message: intent,
  };
}

export function hashExit(intent: ExitIntent, exitContract: Address, chainId: number): Hex {
  return hashTypedData(exitTypedData(intent, exitContract, chainId));
}

export function erc4626ExitData(vault: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [vault]);
}

export function aaveV3ExitData(pool: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [pool]);
}

export function compoundV3ExitData(comet: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [comet]);
}

export function permitTypedData(params: {
  name: string;
  version?: string;
  chainId: number;
  verifyingContract: Address;
  owner: Address;
  spender: Address;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return {
    domain: { name: params.name, version: params.version ?? "1", chainId: params.chainId, verifyingContract: params.verifyingContract },
    types: permitTypes,
    primaryType: "Permit" as const,
    message: { owner: params.owner, spender: params.spender, value: params.value, nonce: params.nonce, deadline: params.deadline },
  };
}

export function cometAuthorizationTypedData(params: {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
  owner: Address;
  manager: Address;
  nonce: bigint;
  expiry: bigint;
}) {
  return {
    domain: { name: params.name, version: params.version, chainId: params.chainId, verifyingContract: params.verifyingContract },
    types: cometAuthorizationTypes,
    primaryType: "Authorization" as const,
    message: { owner: params.owner, manager: params.manager, isAllowed: true, nonce: params.nonce, expiry: params.expiry },
  };
}

export function maxFeeBpsFor(fees: BurnFee[]): number {
  const fast = fees.find((fee) => fee.finalityThreshold <= 1000) ?? fees[0];
  return Math.ceil(fast?.minimumFee ?? 0) + 1;
}

export function serializeExit(intent: ExitIntent): Record<string, unknown> {
  return {
    owner: intent.owner,
    adapterId: intent.adapterId,
    adapterData: intent.adapterData,
    amount: intent.amount.toString(),
    minAssets: intent.minAssets.toString(),
    legs: intent.legs.map((leg) => ({ domain: leg.domain, recipient: leg.recipient, amount: leg.amount.toString() })),
    nonce: intent.nonce.toString(),
    deadline: intent.deadline.toString(),
    maxFeeBps: intent.maxFeeBps,
  };
}

export function parseExit(raw: Record<string, unknown>): ExitIntent {
  return {
    owner: raw.owner as Address,
    adapterId: raw.adapterId as Hex,
    adapterData: raw.adapterData as Hex,
    amount: BigInt(raw.amount as string),
    minAssets: BigInt(raw.minAssets as string),
    legs: ((raw.legs ?? []) as Record<string, unknown>[]).map((leg) => ({
      domain: Number(leg.domain),
      recipient: leg.recipient as Hex,
      amount: BigInt(leg.amount as string),
    })),
    nonce: BigInt(raw.nonce as string),
    deadline: BigInt(raw.deadline as string),
    maxFeeBps: Number(raw.maxFeeBps),
  };
}

export function serializeExitRecord(record: ExitRecord): Record<string, unknown> {
  return {
    hash: record.hash,
    state: record.state,
    domain: record.domain,
    intent: serializeExit(record.intent),
    executor: record.executor,
    exitTx: record.exitTx,
    received: record.received?.toString(),
    legs: record.legs.map((leg) => ({ ...leg, amount: leg.amount.toString() })),
    error: record.error,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function parseExitRecord(raw: Record<string, unknown>): ExitRecord {
  return {
    hash: raw.hash as Hex,
    state: raw.state as ExitState,
    domain: Number(raw.domain),
    intent: parseExit(raw.intent as Record<string, unknown>),
    executor: raw.executor as Address,
    exitTx: (raw.exitTx ?? undefined) as Hex | undefined,
    received: raw.received === undefined || raw.received === null ? undefined : BigInt(raw.received as string),
    legs: ((raw.legs ?? []) as Record<string, unknown>[]).map((leg) => ({
      domain: Number(leg.domain),
      recipient: leg.recipient as Hex,
      amount: BigInt(leg.amount as string),
      message: (leg.message ?? undefined) as Hex | undefined,
      attested: Boolean(leg.attested),
      mintTx: (leg.mintTx ?? undefined) as Hex | undefined,
    })) as ExitLegRecord[],
    error: (raw.error ?? undefined) as string | undefined,
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
  };
}
