import { arcMainnet, networks, type NetworkSpec } from "@inletkit/sdk";
import { createPublicClient, createWalletClient, http, nonceManager, type Address, type Chain, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { arbitrum, arbitrumSepolia, arcTestnet, baseSepolia, monadTestnet, sepolia, unichainSepolia } from "viem/chains";
import type { RelayerConfig } from "./config.js";

export interface ChainContext {
  domain: number;
  chain: Chain;
  publicClient: PublicClient;
  walletClient: WalletClient;
  usdc: Address;
  tokenMessenger: Address;
  messageTransmitter: Address;
  gatewayWallet: Address;
  gatewayMinter: Address;
  fixedGas?: bigint;
}

export const viemChains: Record<number, Chain> = {
  [arcTestnet.id]: arcTestnet,
  [baseSepolia.id]: baseSepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [unichainSepolia.id]: unichainSepolia,
  [sepolia.id]: sepolia,
  [monadTestnet.id]: monadTestnet,
  [arcMainnet.id]: arcMainnet,
  [arbitrum.id]: arbitrum,
};

export function receiversByDomain(spec: NetworkSpec): Record<number, Address> {
  const receivers: Record<number, Address> = {};
  for (const chain of spec.evmChains) {
    const inletReceiver = spec.deployments[chain.key]?.inletReceiver;
    if (inletReceiver) receivers[chain.cctpDomain] = inletReceiver as Address;
  }
  return receivers;
}

export function exitsByDomain(spec: NetworkSpec): Record<number, Address> {
  const exits: Record<number, Address> = {};
  for (const chain of spec.evmChains) {
    const inletExit = spec.deployments[chain.key]?.inletExit;
    if (inletExit) exits[chain.cctpDomain] = inletExit as Address;
  }
  return exits;
}

export function buildChains(config: RelayerConfig): { account: PrivateKeyAccount; byDomain: Record<number, ChainContext> } {
  const account = privateKeyToAccount(config.privateKey, { nonceManager });
  const byDomain: Record<number, ChainContext> = {};
  for (const entry of networks[config.network].evmChains) {
    const chain = viemChains[entry.chainId];
    if (!chain) continue;
    const domain = entry.cctpDomain;
    const transport = http(config.rpc[domain] ?? entry.rpc);
    byDomain[domain] = {
      domain,
      chain,
      publicClient: createPublicClient({ chain, transport }),
      walletClient: createWalletClient({ account, chain, transport }),
      usdc: entry.usdc,
      tokenMessenger: entry.tokenMessengerV2,
      messageTransmitter: entry.messageTransmitterV2,
      gatewayWallet: entry.gatewayWallet,
      gatewayMinter: entry.gatewayMinter,
      fixedGas: domain === config.hubDomain ? 1_500_000n : undefined,
    };
  }
  return { account, byDomain };
}
