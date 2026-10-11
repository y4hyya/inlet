import { networks, parseNetwork, type Network, type NetworkSpec } from "@inletkit/sdk";
import type { Address, Hex } from "viem";
import { exitsByDomain, receiversByDomain } from "./chains.js";

export interface RelayerConfig {
  network: Network;
  privateKey: Hex;
  port: number;
  dbPath: string;
  pollIntervalMs: number;
  irisApi: string;
  gatewayApi: string;
  rpc: Record<number, string>;
  hub: Address;
  hubDomain: number;
  receivers: Record<number, Address>;
  exits: Record<number, Address>;
  uniswapApiKey?: string;
}

/// The RPC variable of a chain is its config key in capitals, so Arc is ARC_RPC on both networks,
/// Base Sepolia is BASE_SEPOLIA_RPC and Arbitrum One is ARBITRUM_RPC.
export function rpcVariable(key: string): string {
  const plain = key.replace(/^arc(Testnet|Mainnet)$/, "arc");
  return `${plain.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase()}_RPC`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, spec: NetworkSpec = networks[parseNetwork(env.NETWORK)]): RelayerConfig {
  const raw = (env.RELAYER_PRIVATE_KEY ?? env.PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  if (!spec.hub.address) throw new Error(`the hub is not deployed on ${spec.network} yet, config/deployments.${spec.network}.json has no inletHub`);
  const rpc: Record<number, string> = {};
  for (const chain of spec.evmChains) rpc[chain.cctpDomain] = env[rpcVariable(chain.key)] ?? chain.rpc;
  return {
    network: spec.network,
    privateKey,
    port: Number(env.PORT ?? 8787),
    dbPath: env.DB_PATH ?? "data/inlet.db",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 3000),
    irisApi: env.IRIS_API ?? spec.circle.irisApi,
    gatewayApi: env.GATEWAY_API ?? spec.circle.gatewayApi,
    rpc,
    hub: spec.hub.address,
    hubDomain: spec.hub.cctpDomain,
    receivers: receiversByDomain(spec),
    exits: exitsByDomain(spec),
    uniswapApiKey: env.UNISWAP_API_KEY?.trim() || undefined,
  };
}
