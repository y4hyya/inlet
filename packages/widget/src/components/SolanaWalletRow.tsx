import { useConnectWallet } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useEffect, useRef } from "react";
import { short } from "../format.js";
import type { SolanaWallet } from "../useDeposit.js";

/// Phantom and its peers arrive through Privy, so this row only renders inside InletProvider.
export function SolanaWalletRow({ busy, onChange }: { busy: boolean; onChange: (wallet: SolanaWallet | undefined) => void }) {
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const signer = useRef({ wallet: wallets[0], send: signAndSendTransaction });
  signer.current = { wallet: wallets[0], send: signAndSendTransaction };
  const address = wallets[0]?.address;

  useEffect(() => {
    onChange(
      address
        ? { address, signAndSend: async (transaction: Uint8Array) => (await signer.current.send({ transaction, wallet: signer.current.wallet, chain: "solana:devnet" })).signature }
        : undefined,
    );
    return () => onChange(undefined);
  }, [address, onChange]);

  if (address) return <p className="inlet-note">Solana wallet {short(address)}</p>;
  return (
    <button className="inlet-secondary" type="button" disabled={busy} onClick={() => connectWallet({ walletChainType: "solana-only" })}>
      Connect a Solana wallet
    </button>
  );
}
