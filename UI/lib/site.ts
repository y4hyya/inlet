import { hubFor, parseNetwork } from "@inletkit/sdk";

const network = parseNetwork(process.env.NEXT_PUBLIC_NETWORK);
const hub = hubFor(network);

export const site = {
  name: "Inlet",
  network,
  tagline: "From any chain into any position",
  description: "A deposit and exit rail for DeFi. One signature on the chain where the USDC sits, the position itself on the chain where the protocol lives, and one signature to bring it back out. Built on Circle Gateway, CCTP V2 and Arc.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://inletkit.vercel.app",
  repo: "https://github.com/y4hyya/inlet",
  relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL ?? "http://localhost:8787",
  hub: hub.address ?? "",
  arcscan: hub.explorer,
};

export const links = {
  spec: `${site.repo}/blob/main/docs/spec.md`,
  adapters: `${site.repo}/blob/main/docs/adapters.md`,
  relayer: `${site.repo}/tree/main/services/relayer`,
  mcp: `${site.repo}/tree/main/apps/mcp`,
  skill: `${site.repo}/blob/main/skills/inlet/SKILL.md`,
  widget: `${site.repo}/tree/main/packages/widget`,
  sdk: `${site.repo}/tree/main/packages/sdk`,
  hub: `${site.arcscan}/address/${site.hub}`,
};
