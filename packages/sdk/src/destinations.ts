import { zeroAddress, type Address, type Hex } from "viem";
import { aaveV3ExitData, compoundV3ExitData, erc4626ExitData } from "./exit.js";
import { mainnetChains, testnetChains } from "./generated/chains.js";
import { mainnetDeployments, testnetDeployments } from "./generated/deployments.js";
import { mainnetProtocols, testnetProtocols } from "./generated/protocols.js";
import { aaveV3AdapterData, adapterId, compoundV3AdapterData, erc4626AdapterData, uniswapV4LpAdapterData, type PoolKey } from "./intent.js";
import type { Deployments, Network } from "./networks.js";
import type { PermitKind } from "./types.js";

export const explorers: Record<number, string> = {
  0: "https://sepolia.etherscan.io/tx/",
  3: "https://sepolia.arbiscan.io/tx/",
  5: "https://explorer.solana.com/tx/",
  6: "https://sepolia.basescan.org/tx/",
  10: "https://sepolia.uniscan.xyz/tx/",
  15: "https://testnet.monadexplorer.com/tx/",
  26: "https://testnet.arcscan.app/tx/",
  27: "https://stellar.expert/explorer/testnet/tx/",
};

export const mainnetExplorers: Record<number, string> = {
  0: "https://etherscan.io/tx/",
  3: "https://arbiscan.io/tx/",
  6: "https://basescan.org/tx/",
  10: "https://uniscan.xyz/tx/",
  26: "https://explorer.arc.io/tx/",
};

export const exitAdapterNames = ["erc4626-exit:v1", "aave-v3-exit:v1", "compound-v3-exit:v1"] as const;

export type ExitAdapterName = (typeof exitAdapterNames)[number];

export const exitAdapterIds = Object.fromEntries(exitAdapterNames.map((name) => [name, adapterId(name)])) as Record<ExitAdapterName, Hex>;

export interface DestinationExit {
  adapterName: ExitAdapterName;
  adapterId: Hex;
  adapterData: Hex;
  positionToken: Address;
  positionDecimals: number;
  permit: PermitKind;
  exitContract: Address;
}

export interface DestinationSpec {
  id: string;
  name: string;
  description: string;
  protocol: string;
  chain: string;
  chainId: number;
  destinationDomain: number;
  receiver: Address;
  adapterName: string;
  adapterId: Hex;
  adapterData: Hex;
  positionLabel: string;
  positionToken?: Address;
  explorer: string;
  exit?: DestinationExit;
}

const deployed = testnetDeployments as unknown as Deployments;

function exitFrom(deployments: Deployments, chain: string, spec: Omit<DestinationExit, "exitContract" | "adapterId">): DestinationExit | undefined {
  const exitContract = deployments[chain]?.inletExit as Address | undefined;
  return exitContract ? { ...spec, adapterId: exitAdapterIds[spec.adapterName], exitContract } : undefined;
}

function exitOn(chain: string, spec: Omit<DestinationExit, "exitContract" | "adapterId">): DestinationExit | undefined {
  return exitFrom(deployed, chain, spec);
}

export interface EvmSource {
  kind: "evm";
  domain: number;
  chainId: number;
  name: string;
  usdc: Address;
  tokenMessenger: Address;
  gatewayWallet: Address;
  explorer: string;
}

export interface SolanaSource {
  kind: "solana";
  domain: number;
  name: string;
  usdc: string;
  tokenMessenger: string;
  messageTransmitter: string;
  explorer: string;
  cluster: "devnet" | "mainnet-beta";
  rpc: string;
}

export type SourceSpec = EvmSource | SolanaSource;

export const unichainEthUsdcPool: PoolKey = {
  currency0: "0x0000000000000000000000000000000000000000",
  currency1: testnetChains.unichainSepolia.usdc as Address,
  fee: testnetProtocols.unichainSepolia.ethUsdcPool.fee,
  tickSpacing: testnetProtocols.unichainSepolia.ethUsdcPool.tickSpacing,
  hooks: "0x0000000000000000000000000000000000000000",
};

export const testnetDestinations: DestinationSpec[] = [
  {
    id: "aave-v3-arbitrum-sepolia",
    name: "Aave V3 on Arbitrum Sepolia",
    description: "Supplies USDC to Aave's Arbitrum Sepolia market. The depositor receives aArbSepUSDC.",
    protocol: "Aave V3",
    chain: "Arbitrum Sepolia",
    chainId: testnetChains.arbitrumSepolia.chainId,
    destinationDomain: 3,
    receiver: testnetDeployments.arbitrumSepolia.inletReceiver as Address,
    adapterName: "aave-v3:v1",
    adapterId: adapterId("aave-v3:v1"),
    adapterData: aaveV3AdapterData(testnetProtocols.arbitrumSepolia.aaveV3Pool as Address, 0n),
    positionLabel: "aArbSepUSDC",
    positionToken: testnetProtocols.arbitrumSepolia.aaveV3AUsdc as Address,
    explorer: explorers[3],
    exit: exitOn("arbitrumSepolia", {
      adapterName: "aave-v3-exit:v1",
      adapterData: aaveV3ExitData(testnetProtocols.arbitrumSepolia.aaveV3Pool as Address),
      positionToken: testnetProtocols.arbitrumSepolia.aaveV3AUsdc as Address,
      positionDecimals: 6,
      permit: "eip2612",
    }),
  },
  {
    id: "compound-v3-base-sepolia",
    name: "Compound III on Base Sepolia",
    description: "Supplies USDC to Compound's Base Sepolia USDC market, credited to the depositor's account.",
    protocol: "Compound III",
    chain: "Base Sepolia",
    chainId: testnetChains.baseSepolia.chainId,
    destinationDomain: 6,
    receiver: testnetDeployments.baseSepolia.inletReceiver as Address,
    adapterName: "compound-v3:v1",
    adapterId: adapterId("compound-v3:v1"),
    adapterData: compoundV3AdapterData(testnetProtocols.baseSepolia.compoundV3Comet as Address, 0n),
    positionLabel: "Compound USDC balance",
    positionToken: testnetProtocols.baseSepolia.compoundV3Comet as Address,
    explorer: explorers[6],
    exit: exitOn("baseSepolia", {
      adapterName: "compound-v3-exit:v1",
      adapterData: compoundV3ExitData(testnetProtocols.baseSepolia.compoundV3Comet as Address),
      positionToken: testnetProtocols.baseSepolia.compoundV3Comet as Address,
      positionDecimals: 6,
      permit: "comet",
    }),
  },
  {
    id: "morpho-oneshot-base-sepolia",
    name: "Morpho Oneshot Vault on Base Sepolia",
    description: "Deposits into the Oneshot MetaMorpho vault over USDC. The depositor receives vUSDC shares.",
    protocol: "Morpho",
    chain: "Base Sepolia",
    chainId: testnetChains.baseSepolia.chainId,
    destinationDomain: 6,
    receiver: testnetDeployments.baseSepolia.inletReceiver as Address,
    adapterName: "erc4626:v1",
    adapterId: adapterId("erc4626:v1"),
    adapterData: erc4626AdapterData(testnetProtocols.baseSepolia.morphoOneshotVault as Address, 0n),
    positionLabel: "vUSDC shares",
    positionToken: testnetProtocols.baseSepolia.morphoOneshotVault as Address,
    explorer: explorers[6],
    exit: exitOn("baseSepolia", {
      adapterName: "erc4626-exit:v1",
      adapterData: erc4626ExitData(testnetProtocols.baseSepolia.morphoOneshotVault as Address),
      positionToken: testnetProtocols.baseSepolia.morphoOneshotVault as Address,
      positionDecimals: 18,
      permit: "eip2612",
    }),
  },
  {
    id: "uniswap-v4-eth-usdc-unichain-sepolia",
    name: "Uniswap v4 ETH/USDC on Unichain Sepolia",
    description: "Mints a USDC only liquidity position just below the current ETH price in the v4 pool. The depositor owns the position NFT.",
    protocol: "Uniswap v4",
    chain: "Unichain Sepolia",
    chainId: testnetChains.unichainSepolia.chainId,
    destinationDomain: 10,
    receiver: testnetDeployments.unichainSepolia.inletReceiver as Address,
    adapterName: "uniswap-v4-lp:v1",
    adapterId: adapterId("uniswap-v4-lp:v1"),
    adapterData: uniswapV4LpAdapterData(unichainEthUsdcPool, 1200, 1n),
    positionLabel: "Uniswap v4 position",
    positionToken: testnetProtocols.unichainSepolia.uniswapV4PositionManager as Address,
    explorer: explorers[10],
  },
  {
    id: "euler-ethereum-sepolia",
    name: "Euler on Ethereum Sepolia",
    description: "Deposits into Euler's EVK vault over Circle USDC. The depositor receives eUSDC-4 shares.",
    protocol: "Euler",
    chain: "Ethereum Sepolia",
    chainId: testnetChains.ethereumSepolia.chainId,
    destinationDomain: 0,
    receiver: testnetDeployments.ethereumSepolia.inletReceiver as Address,
    adapterName: "erc4626:v1",
    adapterId: adapterId("erc4626:v1"),
    adapterData: erc4626AdapterData(testnetProtocols.ethereumSepolia.eulerEUsdc4 as Address, 0n),
    positionLabel: "eUSDC-4 shares",
    positionToken: testnetProtocols.ethereumSepolia.eulerEUsdc4 as Address,
    explorer: explorers[0],
  },
  {
    id: "demo-vault-monad-testnet",
    name: "Inlet Demo Vault on Monad Testnet",
    description: "An ERC 4626 vault over USDC on Monad Testnet, deployed by Inlet for testing.",
    protocol: "Inlet demo",
    chain: "Monad Testnet",
    chainId: testnetChains.monadTestnet.chainId,
    destinationDomain: 15,
    receiver: testnetDeployments.monadTestnet.inletReceiver as Address,
    adapterName: "erc4626:v1",
    adapterId: adapterId("erc4626:v1"),
    adapterData: erc4626AdapterData(testnetDeployments.monadTestnet.demoVault as Address, 0n),
    positionLabel: "vault shares",
    positionToken: testnetDeployments.monadTestnet.demoVault as Address,
    explorer: explorers[15],
  },
  {
    id: "demo-vault",
    name: "Inlet Demo Vault",
    description: "An ERC 4626 vault over USDC on Arbitrum Sepolia, deployed by Inlet for testing.",
    protocol: "Inlet demo",
    chain: "Arbitrum Sepolia",
    chainId: testnetChains.arbitrumSepolia.chainId,
    destinationDomain: 3,
    receiver: testnetDeployments.arbitrumSepolia.inletReceiver as Address,
    adapterName: "erc4626:v1",
    adapterId: adapterId("erc4626:v1"),
    adapterData: erc4626AdapterData(testnetDeployments.arbitrumSepolia.demoVault as Address, 0n),
    positionLabel: "vault shares",
    positionToken: testnetDeployments.arbitrumSepolia.demoVault as Address,
    explorer: explorers[3],
  },
];

/// The mainnet catalog reads the deployment file, so a chain joins it the moment its receiver is
/// recorded and never before, and the exit entry appears with the InletExit on that chain.
export function mainnetCatalog(deployments: Deployments): DestinationSpec[] {
  const arbitrum = deployments.arbitrum ?? {};
  const entries: (DestinationSpec | undefined)[] = [
    arbitrum.inletReceiver
      ? {
          id: "aave-v3-arbitrum",
          name: "Aave V3 on Arbitrum One",
          description: "Supplies USDC to Aave's Arbitrum One market. The depositor receives aArbUSDCn.",
          protocol: "Aave V3",
          chain: "Arbitrum One",
          chainId: mainnetChains.arbitrum.chainId,
          destinationDomain: 3,
          receiver: arbitrum.inletReceiver as Address,
          adapterName: "aave-v3:v1",
          adapterId: adapterId("aave-v3:v1"),
          adapterData: aaveV3AdapterData(mainnetProtocols.arbitrum.aaveV3Pool as Address, 0n),
          positionLabel: "aArbUSDCn",
          positionToken: mainnetProtocols.arbitrum.aaveV3AUsdc as Address,
          explorer: mainnetExplorers[3],
          exit: exitFrom(deployments, "arbitrum", {
            adapterName: "aave-v3-exit:v1",
            adapterData: aaveV3ExitData(mainnetProtocols.arbitrum.aaveV3Pool as Address),
            positionToken: mainnetProtocols.arbitrum.aaveV3AUsdc as Address,
            positionDecimals: 6,
            permit: "eip2612",
          }),
        }
      : undefined,
  ];
  return entries.filter((entry): entry is DestinationSpec => Boolean(entry));
}

export const mainnetDestinations: DestinationSpec[] = mainnetCatalog(mainnetDeployments as unknown as Deployments);

interface EvmChainEntry {
  cctpDomain: number;
  chainId: number;
  usdc: string;
  tokenMessengerV2: string;
  gatewayWallet: string;
}

function evmSource(chain: EvmChainEntry, name: string, explorerMap: Record<number, string>): EvmSource {
  return {
    kind: "evm",
    domain: chain.cctpDomain,
    chainId: chain.chainId,
    name,
    usdc: chain.usdc as Address,
    tokenMessenger: chain.tokenMessengerV2 as Address,
    gatewayWallet: chain.gatewayWallet as Address,
    explorer: explorerMap[chain.cctpDomain] ?? "",
  };
}

function source(key: "baseSepolia" | "arbitrumSepolia" | "unichainSepolia" | "ethereumSepolia" | "monadTestnet", name: string): EvmSource {
  return evmSource(testnetChains[key], name, explorers);
}

const solana = testnetChains.solanaDevnet;

export const testnetSources: SourceSpec[] = [
  source("baseSepolia", "Base Sepolia"),
  source("arbitrumSepolia", "Arbitrum Sepolia"),
  source("unichainSepolia", "Unichain Sepolia"),
  source("ethereumSepolia", "Ethereum Sepolia"),
  source("monadTestnet", "Monad Testnet"),
  {
    kind: "solana",
    domain: solana.cctpDomain,
    name: "Solana Devnet",
    usdc: solana.usdc,
    tokenMessenger: solana.tokenMessengerMinterV2,
    messageTransmitter: solana.messageTransmitterV2,
    explorer: solana.explorer,
    cluster: solana.cluster,
    rpc: solana.rpc,
  },
];

/// Arbitrum One is the only mainnet source for now, and it runs CCTP only because the Gateway route is switched off there.
export const mainnetSources: SourceSpec[] = [evmSource(mainnetChains.arbitrum, "Arbitrum One", mainnetExplorers)];

/// Solana explorer links need the cluster, every other explorer takes the hash alone.
export function explorerLink(domain: number, hash: string, network: Network = "testnet"): string {
  const link = ((network === "mainnet" ? mainnetExplorers : explorers)[domain] ?? "") + hash;
  return domain === 5 && network === "testnet" ? `${link}?cluster=devnet` : link;
}

/// Circle Gateway is not on every chain. The zero address in config means the chain has no GatewayWallet.
export function hasGateway(source: SourceSpec): boolean {
  return source.kind === "evm" && source.gatewayWallet.toLowerCase() !== zeroAddress;
}

export type ExitableDestinationSpec = DestinationSpec & { exit: DestinationExit };

export function exitableOf(destinations: DestinationSpec[]): ExitableDestinationSpec[] {
  return destinations.filter((entry): entry is ExitableDestinationSpec => Boolean(entry.exit));
}

export const exitableDestinations: ExitableDestinationSpec[] = exitableOf(testnetDestinations);
export const mainnetExitableDestinations: ExitableDestinationSpec[] = exitableOf(mainnetDestinations);

export function findDestinationSpec(id: string, network: Network = "testnet"): DestinationSpec | undefined {
  return (network === "mainnet" ? mainnetDestinations : testnetDestinations).find((entry) => entry.id === id);
}

export function findSourceSpec(domain: number, network: Network = "testnet"): SourceSpec | undefined {
  return (network === "mainnet" ? mainnetSources : testnetSources).find((entry) => entry.domain === domain);
}
