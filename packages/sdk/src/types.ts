import type { Address, Hex } from "viem";

export interface DepositIntent {
  owner: Address;
  sourceDomain: number;
  destinationDomain: number;
  adapterId: Hex;
  receiver: Hex;
  beneficiary: Hex;
  adapterData: Hex;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  refundRecipient: Hex;
  feeBps: number;
}

export type Route = "cctp" | "gateway";

export type IntentState =
  | "created"
  | "funded"
  | "swept"
  | "attested"
  | "executed"
  | "claimable"
  | "refunding"
  | "refunded"
  | "expired"
  | "failed";

export interface IntentRecord {
  hash: Hex;
  state: IntentState;
  route: Route;
  intent: DepositIntent;
  depositAddress: Address;
  sourceTx?: Hex;
  arcMintTx?: Hex;
  sweepTx?: Hex;
  destinationTx?: Hex;
  refundTx?: Hex;
  refundMintTx?: Hex;
  result?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ExitLeg {
  domain: number;
  recipient: Hex;
  amount: bigint;
}

export interface ExitIntent {
  owner: Address;
  adapterId: Hex;
  adapterData: Hex;
  amount: bigint;
  minAssets: bigint;
  legs: ExitLeg[];
  nonce: bigint;
  deadline: bigint;
  maxFeeBps: number;
}

export type ExitState = "signed" | "executed" | "attested" | "delivered";

export interface ExitLegRecord extends ExitLeg {
  message?: Hex;
  attested: boolean;
  mintTx?: Hex;
}

export interface ExitRecord {
  hash: Hex;
  state: ExitState;
  domain: number;
  intent: ExitIntent;
  executor: Address;
  exitTx?: Hex;
  received?: bigint;
  legs: ExitLegRecord[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type PermitKind = "eip2612" | "comet";
