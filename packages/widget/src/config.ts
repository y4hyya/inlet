import {
  aaveV3AdapterData,
  adapterId,
  compoundV3AdapterData,
  erc4626AdapterData,
  erc4626ExitData,
  exitAdapterIds,
  explorers as sdkExplorers,
  explorersFor as sdkExplorersFor,
  fromBytes32,
  hubFor,
  mainnetDestinations as mainnetCatalog,
  networks,
  testnetChains,
  testnetDestinations as catalog,
  testnetSources,
  uniswapV4LpAdapterData,
  type DestinationSpec,
  type IntentRecord,
  type Network,
  type PoolKey,
} from "@inletkit/sdk";
import type { Address, Hex } from "viem";
import type { Destination, DestinationExit, PriceHint, SourceChain } from "./types.js";

/// The testnet explorers, kept under this name for hosts that import it. explorersFor answers for either network.
export const explorers = sdkExplorers;

export function explorersFor(network: Network = "testnet"): Record<number, string> {
  return sdkExplorersFor(network);
}

interface DomainTable {
  ids: Record<number, number>;
  names: Record<number, string>;
}

const tables: Partial<Record<Network, DomainTable>> = {};

function tableFor(network: Network): DomainTable {
  let table = tables[network];
  if (!table) {
    const spec = networks[network];
    const ids: Record<number, number> = {};
    for (const chain of spec.evmChains) ids[chain.cctpDomain] = chain.chainId;
    const names: Record<number, string> = { 26: network === "mainnet" ? "Arc" : "Arc Testnet" };
    for (const entry of spec.sources) names[entry.domain] = entry.name;
    for (const entry of spec.destinations) names[entry.destinationDomain] ??= entry.chain;
    table = { ids, names };
    tables[network] = table;
  }
  return table;
}

export function chainIdForDomain(domain: number, network: Network = "testnet"): number {
  return tableFor(network).ids[domain] ?? 0;
}

export function chainNameForDomain(domain: number, network: Network = "testnet"): string {
  return tableFor(network).names[domain] ?? `domain ${domain}`;
}

export type ExitKind = "vault" | "aave" | "comet";

/// Aave and Compound hold USDC one to one, every other exit is a share of a vault.
export function exitKind(exit: { adapterId: Hex }): ExitKind {
  const id = exit.adapterId.toLowerCase();
  if (id === exitAdapterIds["aave-v3-exit:v1"].toLowerCase()) return "aave";
  if (id === exitAdapterIds["compound-v3-exit:v1"].toLowerCase()) return "comet";
  return "vault";
}

export function exitable(destinations: Destination[]): Destination[] {
  return destinations.filter((entry) => entry.exit);
}

export const irisApi = testnetChains.circle.irisApi;
export const gatewayApi = testnetChains.circle.gatewayApi;
export const hubDomain = 26;
export const arcGatewayMinter = testnetChains.arcTestnet.gatewayMinter as Address;
export const arcUsdc = testnetChains.arcTestnet.usdc as Address;

export function circleFor(network: Network = "testnet"): { irisApi: string; gatewayApi: string } {
  return networks[network].circle;
}

/// What a Gateway burn intent names on Arc. The minter is the zero address where the route is off.
export function arcFor(network: Network = "testnet"): { gatewayMinter: Address; usdc: Address } {
  const hub = hubFor(network);
  return { gatewayMinter: hub.gatewayMinter, usdc: hub.usdc };
}

export const defaultSources: SourceChain[] = testnetSources;

export function sourcesFor(network: Network = "testnet"): SourceChain[] {
  return networks[network].sources;
}

/// A vault that implements EIP 2612 becomes withdrawable by naming the InletExit on its chain.
export function erc4626Destination(params: {
  id: string;
  name: string;
  description?: string;
  chainId?: number;
  destinationDomain: number;
  receiver: Address;
  vault: Address;
  positionLabel?: string;
  exitContract?: Address;
  positionDecimals?: number;
  network?: Network;
}): Destination {
  const positionLabel = params.positionLabel ?? "vault shares";
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    chainId: params.chainId ?? chainIdForDomain(params.destinationDomain, params.network),
    destinationDomain: params.destinationDomain,
    receiver: params.receiver,
    adapterId: adapterId("erc4626:v1"),
    adapterData: () => erc4626AdapterData(params.vault, 0n),
    positionLabel,
    explorer: explorersFor(params.network)[params.destinationDomain] ?? "",
    exit: params.exitContract
      ? {
          adapterId: exitAdapterIds["erc4626-exit:v1"],
          adapterData: erc4626ExitData(params.vault),
          positionToken: params.vault,
          positionDecimals: params.positionDecimals ?? 18,
          permit: "eip2612",
          exitContract: params.exitContract,
          positionLabel,
        }
      : undefined,
  };
}

export function aaveV3Destination(params: {
  id: string;
  name: string;
  description?: string;
  chainId?: number;
  destinationDomain: number;
  receiver: Address;
  pool: Address;
  positionLabel?: string;
  network?: Network;
}): Destination {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    chainId: params.chainId ?? chainIdForDomain(params.destinationDomain, params.network),
    destinationDomain: params.destinationDomain,
    receiver: params.receiver,
    adapterId: adapterId("aave-v3:v1"),
    adapterData: () => aaveV3AdapterData(params.pool, 0n),
    positionLabel: params.positionLabel ?? "aTokens",
    explorer: explorersFor(params.network)[params.destinationDomain] ?? "",
  };
}

export function compoundV3Destination(params: {
  id: string;
  name: string;
  description?: string;
  chainId?: number;
  destinationDomain: number;
  receiver: Address;
  comet: Address;
  positionLabel?: string;
  network?: Network;
}): Destination {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    chainId: params.chainId ?? chainIdForDomain(params.destinationDomain, params.network),
    destinationDomain: params.destinationDomain,
    receiver: params.receiver,
    adapterId: adapterId("compound-v3:v1"),
    adapterData: () => compoundV3AdapterData(params.comet, 0n),
    positionLabel: params.positionLabel ?? "supply balance",
    explorer: explorersFor(params.network)[params.destinationDomain] ?? "",
  };
}

export function uniswapV4LpDestination(params: {
  id: string;
  name: string;
  description?: string;
  chainId?: number;
  destinationDomain: number;
  receiver: Address;
  pool: PoolKey;
  rangeTicks?: number;
  positionLabel?: string;
  price?: PriceHint;
  network?: Network;
}): Destination {
  return {
    id: params.id,
    name: params.name,
    description: params.description,
    chainId: params.chainId ?? chainIdForDomain(params.destinationDomain, params.network),
    destinationDomain: params.destinationDomain,
    receiver: params.receiver,
    adapterId: adapterId("uniswap-v4-lp:v1"),
    adapterData: () => uniswapV4LpAdapterData(params.pool, params.rangeTicks ?? 1200, 1n),
    positionLabel: params.positionLabel ?? "liquidity position",
    explorer: explorersFor(params.network)[params.destinationDomain] ?? "",
    price: params.price,
  };
}

const uniswapPrice: PriceHint = {
  chainId: testnetChains.unichainSepolia.chainId,
  tokenIn: testnetChains.unichainSepolia.usdc as Address,
  tokenOut: "0x0000000000000000000000000000000000000000",
  tokenOutSymbol: "ETH",
  tokenOutDecimals: 18,
  venue: "Uniswap Trading API",
};

function exitFromSpec(spec: DestinationSpec): DestinationExit | undefined {
  const exit = spec.exit;
  if (!exit) return undefined;
  return {
    adapterId: exit.adapterId,
    adapterData: exit.adapterData,
    positionToken: exit.positionToken,
    positionDecimals: exit.positionDecimals,
    permit: exit.permit,
    exitContract: exit.exitContract,
    positionLabel: spec.positionLabel,
  };
}

export function fromSpec(spec: DestinationSpec): Destination {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    chainId: spec.chainId,
    destinationDomain: spec.destinationDomain,
    receiver: spec.receiver,
    adapterId: spec.adapterId,
    adapterData: () => spec.adapterData,
    positionLabel: spec.positionLabel,
    explorer: spec.explorer,
    price: spec.adapterName === "uniswap-v4-lp:v1" ? uniswapPrice : undefined,
    exit: exitFromSpec(spec),
  };
}

export const testnetDestinations: Destination[] = catalog.map(fromSpec);
export const mainnetDestinations: Destination[] = mainnetCatalog.map(fromSpec);

export function destinationsFor(network: Network = "testnet"): Destination[] {
  return network === "mainnet" ? mainnetDestinations : testnetDestinations;
}

const preset = (id: string) => testnetDestinations.find((entry) => entry.id === id)!;
export const aaveArbitrumSepoliaDestination = preset("aave-v3-arbitrum-sepolia");
export const compoundBaseSepoliaDestination = preset("compound-v3-base-sepolia");
export const morphoBaseSepoliaDestination = preset("morpho-oneshot-base-sepolia");
export const uniswapUnichainSepoliaDestination = preset("uniswap-v4-eth-usdc-unichain-sepolia");
export const demoVaultDestination = preset("demo-vault");

export function findDestination(record: Pick<IntentRecord, "intent">, candidates: Destination[] = testnetDestinations): Destination | undefined {
  const sameRoute = candidates.filter(
    (entry) => entry.destinationDomain === record.intent.destinationDomain && entry.adapterId.toLowerCase() === record.intent.adapterId.toLowerCase(),
  );
  const beneficiary = fromBytes32(record.intent.beneficiary);
  const amount = record.intent.amount;
  return sameRoute.find((entry) => entry.adapterData({ beneficiary, amount }).toLowerCase() === record.intent.adapterData.toLowerCase()) ?? sameRoute[0];
}
