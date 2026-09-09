// An injected wallet such as MetaMask cannot be disconnected programmatically, so it stays
// connected after the host ends the session and wagmi keeps reporting an address.
export function isSignedIn(params: { address?: string; authenticated?: boolean; isConnected: boolean }): boolean {
  if (!params.address) return false;
  return params.authenticated ?? params.isConnected;
}
