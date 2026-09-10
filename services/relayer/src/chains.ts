import { testnetChains, testnetDeployments } from "@inletkit/sdk";
import { createPublicClient, createWalletClient, http, nonceManager, type Address, type Chain, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { arbitrumSepolia, arcTestnet, baseSepolia, monadTestnet, sepolia, unichainSepolia } from "viem/chains";
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

interface EvmChainConfig {
  chainId: number;
  cctpDomain: number;
  rpc: string;
  usdc: Address;
  tokenMessengerV2: Address;
  messageTransmitterV2: Address;
  gatewayWallet: Address;
  gatewayMinter: Address;
}

const viemChains: Record<number, Chain> = {
  [arcTestnet.id]: arcTestnet,
  [baseSepolia.id]: baseSepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [unichainSepolia.id]: unichainSepolia,
  [sepolia.id]: sepolia,
  [monadTestnet.id]: monadTestnet,
};

export const evmChains = Object.entries(testnetChains).flatMap(([key, entry]) =>
  "chainId" in entry ? [{ key: key as keyof typeof testnetChains, config: entry as EvmChainConfig }] : [],
);

export function receiversByDomain(): Record<number, Address> {
  const receivers: Record<number, Address> = {};
  for (const { key, config } of evmChains) {
    const deployment = (testnetDeployments as Record<string, { inletReceiver?: Address }>)[key];
    if (deployment?.inletReceiver) receivers[config.cctpDomain] = deployment.inletReceiver;
  }
  return receivers;
}

export function exitsByDomain(): Record<number, Address> {
  const deployments = testnetDeployments as unknown as Record<string, Record<string, string | undefined>>;
  const exits: Record<number, Address> = {};
  for (const { key, config } of evmChains) {
    const inletExit = deployments[key]?.inletExit;
    if (inletExit) exits[config.cctpDomain] = inletExit as Address;
  }
  return exits;
}

export function buildChains(config: RelayerConfig): { account: PrivateKeyAccount; byDomain: Record<number, ChainContext> } {
  const account = privateKeyToAccount(config.privateKey, { nonceManager });
  const byDomain: Record<number, ChainContext> = {};
  for (const { config: entry } of evmChains) {
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
