import { useAccount, useDisconnect } from "wagmi";
import { useInlet } from "../context.js";
import { short } from "../format.js";
import { isSignedIn } from "../session.js";

/// The signed in address and the way out of the session, shared by every header.
export function AccountPill() {
  const inlet = useInlet();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const signedIn = isSignedIn({ address, authenticated: inlet.authenticated, isConnected });
  if (!signedIn || !address) return null;

  const label = inlet.logout ? "Log out" : "Disconnect";
  const signOut = async () => {
    if (!inlet.logout) return disconnect();
    try {
      await inlet.logout();
    } catch (error) {
      console.error("Inlet could not end the session", error);
    }
  };

  return (
    <button className="inlet-account" type="button" onClick={signOut} title={`${label}, ${address}`} aria-label={`${label} ${short(address)}`}>
      <span className="inlet-account-name">{short(address)}</span>
      <svg className="inlet-account-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M9.5 13.5H4.5A1.5 1.5 0 0 1 3 12V4a1.5 1.5 0 0 1 1.5-1.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.5 8H14m-2.5-2.5L14 8l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
