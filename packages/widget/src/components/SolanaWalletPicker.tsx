import { useConnectWallet } from "@privy-io/react-auth";
import { useSignAndSendTransaction, useWallets } from "@privy-io/react-auth/solana";
import { useEffect, useRef, useState } from "react";
import { short } from "../format.js";
import type { SolanaWallet } from "../useDeposit.js";

/// Phantom and its peers arrive through Privy, so this picker only renders inside InletProvider.
export function SolanaWalletPicker({ busy, onChange }: { busy: boolean; onChange: (wallet: SolanaWallet | undefined) => void }) {
  const { connectWallet } = useConnectWallet();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [chosen, setChosen] = useState<string>();
  const external = wallets.find((entry) => entry.standardWallet.name !== "Privy");
  const wallet = wallets.find((entry) => entry.address === chosen) ?? external ?? wallets[0];
  const signer = useRef({ wallet, send: signAndSendTransaction });
  signer.current = { wallet, send: signAndSendTransaction };
  const address = wallet?.address;

  useEffect(() => {
    onChange(
      address
        ? { address, signAndSend: async (transaction: Uint8Array) => (await signer.current.send({ transaction, wallet: signer.current.wallet!, chain: "solana:devnet" })).signature }
        : undefined,
    );
    return () => onChange(undefined);
  }, [address, onChange]);

  const connect = () => connectWallet({ walletChainType: "solana-only" });
  if (!wallet) {
    return (
      <button className="inlet-secondary" type="button" disabled={busy} onClick={connect}>
        Connect a Solana wallet
      </button>
    );
  }
  return (
    <div className="inlet-row">
      <select id="inlet-solana-wallet" name="solanaWallet" value={wallet.address} onChange={(event) => setChosen(event.target.value)} disabled={busy}>
        {wallets.map((entry) => (
          <option key={entry.address} value={entry.address}>
            {entry.standardWallet.name} {short(entry.address)}
          </option>
        ))}
      </select>
      <button className="inlet-link" type="button" disabled={busy} onClick={connect}>
        Connect another
      </button>
    </div>
  );
}
