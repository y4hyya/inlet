import { arcMainnet, chainsFor, destinationsFor, parseNetwork, toBytes32, type Network } from "@inletkit/sdk";
import { createPublicClient, erc20Abi, http, type Address, type Chain, type Hex, type PublicClient } from "viem";
import { arbitrum, arbitrumSepolia, baseSepolia, monadTestnet, sepolia, unichainSepolia } from "viem/chains";

export interface E2eDestination {
  name: string;
  domain: number;
  chain: Chain;
  receiver: Address;
  adapterId: Hex;
  adapterData: Hex;
  positionLabel: string;
  position(user: Address): Promise<bigint>;
}

export const network: Network = parseNetwork(process.env.NETWORK);

const viemChains: Record<number, Chain> = {
  [sepolia.id]: sepolia,
  [arbitrumSepolia.id]: arbitrumSepolia,
  [baseSepolia.id]: baseSepolia,
  [unichainSepolia.id]: unichainSepolia,
  [monadTestnet.id]: monadTestnet,
  [arbitrum.id]: arbitrum,
  [arcMainnet.id]: arcMainnet,
};

const evmChains = chainsFor(network);

function chainFor(chainId: number): Chain {
  const chain = viemChains[chainId];
  if (!chain) throw new Error(`no viem chain for chain id ${chainId}`);
  return chain;
}

const clients = new Map<number, PublicClient>();

function clientFor(chainId: number): PublicClient {
  let client = clients.get(chainId);
  if (!client) {
    const entry = evmChains.find((chain) => chain.chainId === chainId);
    if (!entry) throw new Error(`chain id ${chainId} is not in the ${network} config`);
    client = createPublicClient({ chain: chainFor(chainId), transport: http(entry.rpc) }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}

/// Every catalog entry names its position token, and each one answers balanceOf, so the reader is the same everywhere.
export const destinations: Record<string, E2eDestination> = Object.fromEntries(
  destinationsFor(network).map((spec) => [
    spec.id,
    {
      name: spec.name,
      domain: spec.destinationDomain,
      chain: chainFor(spec.chainId),
      receiver: spec.receiver,
      adapterId: spec.adapterId,
      adapterData: spec.adapterData,
      positionLabel: spec.adapterName === "uniswap-v4-lp:v1" ? "Uniswap v4 positions owned" : spec.positionLabel,
      position: (user: Address) => clientFor(spec.chainId).readContract({ address: spec.positionToken as Address, abi: erc20Abi, functionName: "balanceOf", args: [user] }),
    },
  ]),
);

const aliases: Record<Network, Record<string, string>> = {
  testnet: {
    aave: "aave-v3-arbitrum-sepolia",
    compound: "compound-v3-base-sepolia",
    morpho: "morpho-oneshot-base-sepolia",
    uniswap: "uniswap-v4-eth-usdc-unichain-sepolia",
    euler: "euler-ethereum-sepolia",
    monad: "demo-vault-monad-testnet",
  },
  mainnet: { aave: "aave-v3-arbitrum" },
};

const defaultDestination: Record<Network, string> = { testnet: "demo-vault", mainnet: "aave-v3-arbitrum" };

export function pickDestination(): E2eDestination {
  const key = process.env.DESTINATION ?? defaultDestination[network];
  const destination = destinations[aliases[network][key] ?? key];
  if (!destination) throw new Error(`DESTINATION must be one of ${Object.keys(destinations).join(", ")}`);
  return destination;
}

const defaultSource: Record<Network, number> = { testnet: 6, mainnet: 3 };

export function pickSource() {
  const domain = Number(process.env.SOURCE ?? defaultSource[network]);
  const source = evmChains.find((chain) => chain.cctpDomain === domain && chain.cctpDomain !== 26);
  if (!source) throw new Error(`SOURCE must be one of ${evmChains.filter((chain) => chain.cctpDomain !== 26).map((chain) => chain.cctpDomain).join(", ")}`);
  const { key, chainId, ...config } = source;
  return { domain, chain: chainFor(chainId), ...config };
}

export function intentReceiver(destination: E2eDestination) {
  return toBytes32(destination.receiver);
}
