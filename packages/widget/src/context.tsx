import { createContext, useContext } from "react";

export interface InletContextValue {
  relayerUrl: string;
  login?: () => void;
  logout?: () => Promise<void> | void;
  ready: boolean;
  // The host's session flag. An injected wallet stays connected after logout, so
  // wagmi keeps reporting an address and cannot tell us whether the session ended.
  authenticated?: boolean;
  // True while the host's own connect flow is on screen, so we do not ask the wallet twice.
  connecting?: boolean;
}

export const InletContext = createContext<InletContextValue>({ relayerUrl: "", ready: true });

export function useInlet() {
  return useContext(InletContext);
}
