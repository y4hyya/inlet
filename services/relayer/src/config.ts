import { testnetChains, testnetDeployments } from "@inletkit/sdk";
import type { Address, Hex } from "viem";
import { exitsByDomain, receiversByDomain } from "./chains.js";
import type { StellarSettings } from "./stellar.js";

export interface RelayerConfig {
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
  // Present when a Stellar key is configured. Without it the relayer refuses intents toward Stellar.
  stellar?: StellarSettings;
  uniswapApiKey?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayerConfig {
  const raw = (env.RELAYER_PRIVATE_KEY ?? env.PRIVATE_KEY ?? "").trim();
  if (!raw) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const privateKey = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
  return {
    privateKey,
    port: Number(env.PORT ?? 8787),
    dbPath: env.DB_PATH ?? "data/inlet.db",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS ?? 3000),
    irisApi: env.IRIS_API ?? testnetChains.circle.irisApi,
    gatewayApi: env.GATEWAY_API ?? testnetChains.circle.gatewayApi,
    rpc: {
      26: env.ARC_RPC ?? testnetChains.arcTestnet.rpc,
      6: env.BASE_SEPOLIA_RPC ?? testnetChains.baseSepolia.rpc,
      3: env.ARBITRUM_SEPOLIA_RPC ?? testnetChains.arbitrumSepolia.rpc,
      10: env.UNICHAIN_SEPOLIA_RPC ?? testnetChains.unichainSepolia.rpc,
      0: env.ETHEREUM_SEPOLIA_RPC ?? testnetChains.ethereumSepolia.rpc,
      15: env.MONAD_TESTNET_RPC ?? testnetChains.monadTestnet.rpc,
    },
    hub: (env.HUB_ADDRESS?.trim() || testnetDeployments.arcTestnet.inletHub) as Address,
    hubDomain: 26,
    receivers: receiversByDomain(),
    exits: exitsByDomain(),
    stellar: env.STELLAR_SECRET_KEY?.trim()
      ? {
          rpc: env.STELLAR_RPC ?? testnetChains.stellarTestnet.rpc,
          passphrase: testnetChains.stellarTestnet.network,
          secret: env.STELLAR_SECRET_KEY.trim(),
          receiver: env.STELLAR_RECEIVER?.trim() || testnetDeployments.stellarTestnet.inletReceiver,
        }
      : undefined,
    uniswapApiKey: env.UNISWAP_API_KEY?.trim() || undefined,
  };
}
