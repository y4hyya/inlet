import type { Address, Hex } from "viem";
import { testnetChains } from "./generated/chains.js";
import { testnetDeployments } from "./generated/deployments.js";
import { testnetProtocols } from "./generated/protocols.js";
import { aaveV3AdapterData, adapterId, compoundV3AdapterData, erc4626AdapterData, uniswapV4LpAdapterData, type PoolKey } from "./intent.js";

export const explorers: Record<number, string> = {
  0: "https://sepolia.etherscan.io/tx/",
  3: "https://sepolia.arbiscan.io/tx/",
  6: "https://sepolia.basescan.org/tx/",
  10: "https://sepolia.uniscan.xyz/tx/",
  15: "https://testnet.monadexplorer.com/tx/",
  26: "https://testnet.arcscan.app/tx/",
  27: "https://stellar.expert/explorer/testnet/tx/",
};

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
}

export interface SourceSpec {
  domain: number;
  chainId: number;
  name: string;
  usdc: Address;
  tokenMessenger: Address;
  gatewayWallet: Address;
  explorer: string;
}

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

function source(key: "baseSepolia" | "arbitrumSepolia" | "unichainSepolia" | "ethereumSepolia", name: string): SourceSpec {
  const chain = testnetChains[key];
  return {
    domain: chain.cctpDomain,
    chainId: chain.chainId,
    name,
    usdc: chain.usdc as Address,
    tokenMessenger: chain.tokenMessengerV2 as Address,
    gatewayWallet: chain.gatewayWallet as Address,
    explorer: explorers[chain.cctpDomain] ?? "",
  };
}

export const testnetSources: SourceSpec[] = [
  source("baseSepolia", "Base Sepolia"),
  source("arbitrumSepolia", "Arbitrum Sepolia"),
  source("unichainSepolia", "Unichain Sepolia"),
  source("ethereumSepolia", "Ethereum Sepolia"),
];

export function findDestinationSpec(id: string): DestinationSpec | undefined {
  return testnetDestinations.find((entry) => entry.id === id);
}

export function findSourceSpec(domain: number): SourceSpec | undefined {
  return testnetSources.find((entry) => entry.domain === domain);
}
