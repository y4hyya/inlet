import { demoVaultAbi, testnetChains, testnetDeployments, testnetDestinations as catalog, testnetProtocols, toBytes32 } from "@inletkit/sdk";
import { createPublicClient, erc20Abi, http, type Address, type Chain, type Hex, type PublicClient } from "viem";
import { arbitrumSepolia, baseSepolia, monadTestnet, sepolia, unichainSepolia } from "viem/chains";

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

const rpc = (key: keyof typeof testnetChains) => (testnetChains[key] as { rpc: string }).rpc;

const arbitrum = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc("arbitrumSepolia")) }) as PublicClient;
const base = createPublicClient({ chain: baseSepolia, transport: http(rpc("baseSepolia")) }) as PublicClient;
const unichain = createPublicClient({ chain: unichainSepolia, transport: http(rpc("unichainSepolia")) }) as PublicClient;
const ethereum = createPublicClient({ chain: sepolia, transport: http(rpc("ethereumSepolia")) }) as PublicClient;
const monad = createPublicClient({ chain: monadTestnet, transport: http(rpc("monadTestnet")) }) as PublicClient;

function balanceReader(client: PublicClient, token: Address) {
  return (user: Address) => client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [user] });
}

const readers: Record<string, (user: Address) => Promise<bigint>> = {
  "demo-vault": (user) => arbitrum.readContract({ address: testnetDeployments.arbitrumSepolia.demoVault as Address, abi: demoVaultAbi, functionName: "balanceOf", args: [user] }),
  "aave-v3-arbitrum-sepolia": balanceReader(arbitrum, testnetProtocols.arbitrumSepolia.aaveV3AUsdc as Address),
  "compound-v3-base-sepolia": balanceReader(base, testnetProtocols.baseSepolia.compoundV3Comet as Address),
  "morpho-oneshot-base-sepolia": balanceReader(base, testnetProtocols.baseSepolia.morphoOneshotVault as Address),
  "uniswap-v4-eth-usdc-unichain-sepolia": balanceReader(unichain, testnetProtocols.unichainSepolia.uniswapV4PositionManager as Address),
  "euler-ethereum-sepolia": balanceReader(ethereum, testnetProtocols.ethereumSepolia.eulerEUsdc4 as Address),
  "demo-vault-monad-testnet": (user) => monad.readContract({ address: testnetDeployments.monadTestnet.demoVault as Address, abi: demoVaultAbi, functionName: "balanceOf", args: [user] }),
};

const aliases: Record<string, string> = {
  aave: "aave-v3-arbitrum-sepolia",
  compound: "compound-v3-base-sepolia",
  morpho: "morpho-oneshot-base-sepolia",
  uniswap: "uniswap-v4-eth-usdc-unichain-sepolia",
  euler: "euler-ethereum-sepolia",
  monad: "demo-vault-monad-testnet",
};

const chains: Record<number, Chain> = { 0: sepolia, 3: arbitrumSepolia, 6: baseSepolia, 10: unichainSepolia, 15: monadTestnet };

export const destinations: Record<string, E2eDestination> = Object.fromEntries(
  catalog.map((spec) => [
    spec.id,
    {
      name: spec.name,
      domain: spec.destinationDomain,
      chain: chains[spec.destinationDomain],
      receiver: spec.receiver,
      adapterId: spec.adapterId,
      adapterData: spec.adapterData,
      positionLabel: spec.id === "uniswap-v4-eth-usdc-unichain-sepolia" ? "Uniswap v4 positions owned" : spec.positionLabel,
      position: readers[spec.id],
    },
  ]),
);

export function pickDestination(): E2eDestination {
  const key = process.env.DESTINATION ?? "demo-vault";
  const destination = destinations[aliases[key] ?? key];
  if (!destination) throw new Error(`DESTINATION must be one of ${Object.keys(destinations).join(", ")}`);
  return destination;
}

export const sourceChains: Record<number, { key: keyof typeof testnetChains; chain: Chain }> = {
  6: { key: "baseSepolia", chain: baseSepolia },
  3: { key: "arbitrumSepolia", chain: arbitrumSepolia },
  10: { key: "unichainSepolia", chain: unichainSepolia },
  0: { key: "ethereumSepolia", chain: sepolia },
};

export function pickSource() {
  const domain = Number(process.env.SOURCE ?? 6);
  const source = sourceChains[domain];
  if (!source) throw new Error(`SOURCE must be one of ${Object.keys(sourceChains).join(", ")}`);
  const config = testnetChains[source.key] as { rpc: string; usdc: Address; tokenMessengerV2: Address; gatewayWallet: Address };
  return { domain, chain: source.chain, ...config };
}

export function intentReceiver(destination: E2eDestination) {
  return toBytes32(destination.receiver);
}
