import type { ExitRecord, IntentRecord, PermitKind, Route } from "@inletkit/sdk";
import type { Address, Hex } from "viem";

export interface Destination {
  id: string;
  name: string;
  description?: string;
  chainId: number;
  destinationDomain: number;
  receiver: Address;
  adapterId: Hex;
  adapterData: (context: { beneficiary: Address; amount: bigint }) => Hex;
  positionLabel: string;
  explorer: string;
  price?: PriceHint;
  exit?: DestinationExit;
}

/// What the exit rail needs to pull this position back out, mirroring the SDK spec.
export interface DestinationExit {
  adapterId: Hex;
  adapterData: Hex;
  positionToken: Address;
  positionDecimals: number;
  permit: PermitKind;
  exitContract: Address;
  positionLabel: string;
}

export interface PriceHint {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  tokenOutSymbol: string;
  tokenOutDecimals: number;
  venue: string;
}

export interface SourceChain {
  domain: number;
  chainId: number;
  name: string;
  usdc: Address;
  tokenMessenger: Address;
  gatewayWallet: Address;
  explorer: string;
}

export type RoutePreference = Route | "auto";

export interface Quote {
  route: Route;
  sourceDomain: number;
  sendAmount: bigint;
  intentAmount: bigint;
  circleFee: bigint;
  walletUsdc: bigint;
  gatewayAvailable: bigint;
  gatewayBalances: Record<number, bigint>;
  gatewayElsewhere?: number;
  needsGas: boolean;
  ready: boolean;
  blocker?: string;
}

export type Phase = "idle" | "quoting" | "ready" | "creating" | "signing" | "sending" | "tracking" | "done" | "error";

export interface DepositState {
  phase: Phase;
  quote?: Quote;
  record?: IntentRecord;
  sourceTx?: Hex;
  error?: string;
}

/// A position this wallet holds, in position units and in what those units are worth in USDC.
export interface ExitPosition {
  destination: Destination;
  balance: bigint;
  assets: bigint;
}

/// One row of the To list. The last leg takes the remainder, so it carries no amount.
export interface ExitLegInput {
  domain: number;
  amount?: bigint;
}

export interface ExitQuoteLeg {
  domain: number;
  amount: bigint;
  fee: bigint;
  lands: bigint;
  last: boolean;
}

export interface ExitQuote {
  destination: Destination;
  amount: bigint;
  position: bigint;
  minAssets: bigint;
  maxFeeBps: number;
  legs: ExitQuoteLeg[];
  balance: bigint;
  assets: bigint;
  ready: boolean;
  blocker?: string;
}

export interface ExitWidgetState {
  phase: Phase;
  quote?: ExitQuote;
  record?: ExitRecord;
  error?: string;
}
