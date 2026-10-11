import { defineChain } from "viem";
import { arc } from "viem/chains";
import { mainnetChains } from "./generated/chains.js";

/// viem ships Arc mainnet without an RPC url or an explorer, so both come from the config here.
export const arcMainnet = defineChain({
  ...arc,
  rpcUrls: { default: { http: [mainnetChains.arcMainnet.rpc] } },
  blockExplorers: { default: { name: "Arc Explorer", url: mainnetChains.arcMainnet.explorer } },
});
