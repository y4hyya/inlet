import type { Address } from "viem";
import { explorers, mainnetDestinations, mainnetExplorers, mainnetSources, testnetDestinations, testnetSources, type DestinationSpec, type SourceSpec } from "./destinations.js";
import { mainnetChains, testnetChains } from "./generated/chains.js";
import { mainnetDeployments, testnetDeployments } from "./generated/deployments.js";

export type Network = "testnet" | "mainnet";

export interface EvmChainSpec {
  key: string;
  chainId: number;
  cctpDomain: number;
  rpc: string;
  explorer: string;
  usdc: Address;
  tokenMessengerV2: Address;
  messageTransmitterV2: Address;
  gatewayWallet: Address;
  gatewayMinter: Address;
  gatewayDomain?: number;
}

export type Deployments = Record<string, Record<string, string | undefined> | undefined>;

/// Everything that differs between testnet and mainnet, read from the generated config of one network.
export interface NetworkSpec {
  network: Network;
  evmChains: EvmChainSpec[];
  hub: EvmChainSpec & { address?: Address };
  deployments: Deployments;
  circle: { irisApi: string; gatewayApi: string };
  explorers: Record<number, string>;
  destinations: DestinationSpec[];
  sources: SourceSpec[];
}

/// The CCTP domain of Arc, the same on testnet and mainnet.
export const arcDomain = 26;

/// Only entries with a chain id, a domain and a real RPC url are EVM chains a client can be built for.
function evmChainsOf(chains: Record<string, unknown>): EvmChainSpec[] {
  return Object.entries(chains).flatMap(([key, entry]) => {
    const value = entry as Partial<EvmChainSpec>;
    const usable = typeof value.chainId === "number" && typeof value.cctpDomain === "number" && typeof value.rpc === "string" && /^https?:\/\//.test(value.rpc);
    return usable ? [{ ...(value as EvmChainSpec), key }] : [];
  });
}

function build(
  network: Network,
  chains: Record<string, unknown>,
  deployments: Deployments,
  circle: { irisApi: string; gatewayApi: string },
  explorerMap: Record<number, string>,
  destinations: DestinationSpec[],
  sources: SourceSpec[],
): NetworkSpec {
  const evmChains = evmChainsOf(chains);
  const arc = evmChains.find((chain) => chain.cctpDomain === arcDomain);
  if (!arc) throw new Error(`the ${network} config has no Arc chain`);
  const address = deployments[arc.key]?.inletHub as Address | undefined;
  return { network, evmChains, hub: { ...arc, address }, deployments, circle, explorers: explorerMap, destinations, sources };
}

export const networks: Record<Network, NetworkSpec> = {
  testnet: build("testnet", testnetChains, testnetDeployments as unknown as Deployments, testnetChains.circle, explorers, testnetDestinations, testnetSources),
  mainnet: build("mainnet", mainnetChains, mainnetDeployments as unknown as Deployments, mainnetChains.circle, mainnetExplorers, mainnetDestinations, mainnetSources),
};

export function isNetwork(value: unknown): value is Network {
  return value === "testnet" || value === "mainnet";
}

/// An unset value means testnet, anything but the two names is a configuration mistake worth stopping on.
export function parseNetwork(value: string | undefined, fallback: Network = "testnet"): Network {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (isNetwork(trimmed)) return trimmed;
  throw new Error(`NETWORK must be testnet or mainnet, got ${trimmed}`);
}

export function chainsFor(network: Network): EvmChainSpec[] {
  return networks[network].evmChains;
}

export function hubFor(network: Network): NetworkSpec["hub"] {
  return networks[network].hub;
}

export function circleFor(network: Network): NetworkSpec["circle"] {
  return networks[network].circle;
}

export function explorersFor(network: Network): Record<number, string> {
  return networks[network].explorers;
}

export function destinationsFor(network: Network): DestinationSpec[] {
  return networks[network].destinations;
}

export function sourcesFor(network: Network): SourceSpec[] {
  return networks[network].sources;
}
