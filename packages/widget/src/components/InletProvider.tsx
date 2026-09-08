import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { http } from "viem";
import { arbitrumSepolia, arcTestnet, baseSepolia } from "viem/chains";
import { InletContext } from "../context.js";

const chains = [baseSepolia, arbitrumSepolia, arcTestnet] as const;

export interface InletAppearance {
  theme?: "light" | "dark" | `#${string}`;
  accentColor?: `#${string}`;
  logo?: string;
}

export interface InletProviderProps {
  privyAppId: string;
  relayerUrl: string;
  rpc?: Partial<Record<number, string>>;
  appearance?: InletAppearance;
  children: ReactNode;
}

export function InletProvider({ privyAppId, relayerUrl, rpc = {}, appearance = {}, children }: InletProviderProps) {
  const queryClient = useMemo(() => new QueryClient(), []);
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains,
        transports: {
          [baseSepolia.id]: http(rpc[baseSepolia.id]),
          [arbitrumSepolia.id]: http(rpc[arbitrumSepolia.id]),
          [arcTestnet.id]: http(rpc[arcTestnet.id] ?? "https://rpc.testnet.arc.io"),
        },
      }),
    [rpc],
  );

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ["email", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, solana: { createOnLogin: "off" } },
        defaultChain: baseSepolia,
        supportedChains: [...chains],
        appearance: {
          theme: appearance.theme ?? "light",
          accentColor: appearance.accentColor ?? "#0f6fff",
          logo: appearance.logo,
          walletChainType: "ethereum-only",
          walletList: ["metamask", "detected_ethereum_wallets", "wallet_connect_qr"],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <Bridge relayerUrl={relayerUrl}>{children}</Bridge>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

function Bridge({ relayerUrl, children }: { relayerUrl: string; children: ReactNode }) {
  const { login, logout, ready } = usePrivy();
  const value = useMemo(() => ({ relayerUrl, login, logout, ready }), [relayerUrl, login, logout, ready]);
  return <InletContext.Provider value={value}>{children}</InletContext.Provider>;
}
