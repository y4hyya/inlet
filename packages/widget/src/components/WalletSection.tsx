import { short } from "../format.js";
import type { SourceChain } from "../types.js";
import type { SolanaWallet } from "../useDeposit.js";
import { SolanaWalletPicker } from "./SolanaWalletPicker.js";

export function WalletSection({
  source,
  busy,
  privy,
  address,
  chainId,
  signedIn,
  onSolana,
}: {
  source: SourceChain;
  busy: boolean;
  privy: boolean;
  address?: string;
  chainId?: number;
  signedIn: boolean;
  onSolana: (wallet: SolanaWallet | undefined) => void;
}) {
  if (source.kind === "solana") {
    return (
      <div className="inlet-field">
        <span>Wallet</span>
        {privy ? <SolanaWalletPicker busy={busy} onChange={onSolana} /> : <p className="inlet-wallet">Solana wallets connect through InletProvider.</p>}
        {signedIn && address ? <p className="inlet-hint">Position goes to {short(address)}</p> : null}
      </div>
    );
  }
  const text = !signedIn || !address ? "Log in to choose a wallet" : chainId === source.chainId ? `${short(address)} on ${source.name}` : `${short(address)}, switches to ${source.name} when you deposit`;
  return (
    <div className="inlet-field">
      <span>Wallet</span>
      <p className="inlet-wallet">{text}</p>
    </div>
  );
}
