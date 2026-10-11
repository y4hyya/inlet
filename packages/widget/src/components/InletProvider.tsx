import { PrivyProvider, useModalStatus, usePrivy, type ConnectedWallet } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { arcMainnet, type Network } from "@inletkit/sdk";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import { http, type Chain } from "viem";
import { arbitrum, arbitrumSepolia, arcTestnet, baseSepolia, monadTestnet, sepolia, unichainSepolia } from "viem/chains";
import { InletContext } from "../context.js";

type Chains = readonly [Chain, ...Chain[]];

const testnetChains: Chains = [baseSepolia, arbitrumSepolia, unichainSepolia, sepolia, monadTestnet, arcTestnet];
const mainnetChains: Chains = [arbitrum, arcMainnet];

function chainsFor(network: Network): { chains: Chains; defaultChain: Chain } {
  return network === "mainnet" ? { chains: mainnetChains, defaultChain: arbitrum } : { chains: testnetChains, defaultChain: baseSepolia };
}

export interface InletAppearance {
  theme?: "light" | "dark" | `#${string}`;
  accentColor?: `#${string}`;
  logo?: string;
}

// One identity across renders. A fresh object rebuilds the wagmi config every render.
const noRpc: Partial<Record<number, string>> = {};
const noAppearance: InletAppearance = {};

// Wagmi keeps whichever wallet it connected to first, so a second wallet never takes over
// on its own. Prefer the one the user connected themselves over the embedded fallback.
function preferConnectedWallet({ wallets }: { wallets: ConnectedWallet[] }): ConnectedWallet | undefined {
  return wallets.find((wallet) => wallet.walletClientType !== "privy") ?? wallets[0];
}

export interface InletProviderProps {
  privyAppId: string;
  relayerUrl: string;
  // Testnet unless told otherwise. Mainnet puts Arbitrum One and Arc in the wallet and points every widget at Circle's mainnet hosts.
  network?: Network;
  rpc?: Partial<Record<number, string>>;
  appearance?: InletAppearance;
  children: ReactNode;
}

export function InletProvider({ privyAppId, relayerUrl, network = "testnet", rpc = noRpc, appearance = noAppearance, children }: InletProviderProps) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const { chains, defaultChain } = chainsFor(network);
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains,
        transports: Object.fromEntries(chains.map((chain) => [chain.id, http(rpc[chain.id] ?? chain.rpcUrls.default.http[0])])),
      }),
    [chains, rpc],
  );

  const privyConfig = useMemo(
    () =>
      ({
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, solana: { createOnLogin: "off" } },
        externalWallets: { solana: { connectors: toSolanaWalletConnectors() } },
        defaultChain,
        supportedChains: [...chains],
        appearance: {
          theme: appearance.theme ?? "light",
          accentColor: appearance.accentColor ?? "#0f6fff",
          logo: appearance.logo,
          walletChainType: "ethereum-and-solana",
          walletList: ["metamask", "detected_ethereum_wallets", "rainbow", "phantom", "uniswap", "wallet_connect_qr"],
        },
      }) satisfies ComponentProps<typeof PrivyProvider>["config"],
    [chains, defaultChain, appearance.theme, appearance.accentColor, appearance.logo],
  );

  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={preferConnectedWallet}>
          <Bridge relayerUrl={relayerUrl} network={network}>
            {children}
          </Bridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function Bridge({ relayerUrl, network, children }: { relayerUrl: string; network: Network; children: ReactNode }) {
  const { login, logout, ready, authenticated } = usePrivy();
  const { isOpen } = useModalStatus();
  const value = useMemo(
    () => ({ relayerUrl, network, login, logout, ready, authenticated, connecting: isOpen, privy: true }),
    [relayerUrl, network, login, logout, ready, authenticated, isOpen],
  );
  return <InletContext.Provider value={value}>{children}</InletContext.Provider>;
}
