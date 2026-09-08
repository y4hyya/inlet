import type { Actor } from "./runs";

export interface Step {
  id: string;
  number: string;
  title: string;
  body: string;
  actor: Actor;
  actorLabel: string;
}

export const steps: Step[] = [
  {
    id: "register",
    number: "01",
    title: "Register",
    body: "The widget registers the intent with a relayer and gets back a deposit address on Arc. The hub derives it from every parameter of the deposit, so the address itself is the commitment.",
    actor: "contract",
    actorLabel: "Hub on Arc",
  },
  {
    id: "fund",
    number: "02",
    title: "Fund",
    body: "The user funds that address in one action. A signed Gateway burn intent spends the unified balance with no gas and no network switch, or a CCTP burn leaves the wallet directly.",
    actor: "user",
    actorLabel: "User wallet",
  },
  {
    id: "sweep",
    number: "03",
    title: "Sweep",
    body: "Anyone can call sweep on the hub. It pulls the USDC out of the deposit address and burns it through CCTP toward the destination chain, with the intent in the hook data.",
    actor: "relayer",
    actorLabel: "Relayer",
  },
  {
    id: "attest",
    number: "04",
    title: "Attest",
    body: "Circle attests the burn. The relayer submits the mint on the destination chain and hands the same message to the receiver.",
    actor: "circle",
    actorLabel: "Circle",
  },
  {
    id: "execute",
    number: "05",
    title: "Execute",
    body: "The receiver checks that Circle minted the message, then calls the adapter, which makes the protocol deposit in the user's name.",
    actor: "contract",
    actorLabel: "Receiver and adapter",
  },
  {
    id: "settle",
    number: "06",
    title: "Settle",
    body: "After the deadline anyone can refund. If the adapter call fails the USDC waits in the receiver, claimable by the user. No path leads anywhere else.",
    actor: "escrow",
    actorLabel: "Escrow",
  },
];

export const guarantees = [
  {
    title: "The address is the commitment",
    body: "USDC only reaches the deposit address because the user named that address in the transfer they signed. Inlet never needs a signature of its own.",
  },
  {
    title: "The path is fixed",
    body: "The hub can move USDC along the path the intent names, or back to the refund address after the deadline. There is no third option.",
  },
  {
    title: "The relayer is optional",
    body: "Sweep, refund, receive and claim are permissionless. A relayer can delay a deposit. It cannot redirect one, and it is not needed to finish one.",
  },
];

export const tools = [
  { name: "list_destinations", what: "every live destination and the adapter behind it" },
  { name: "quote_deposit", what: "route, timing and the position the user ends up with" },
  { name: "create_intent", what: "deposit address plus the exact payload to sign" },
  { name: "deposit", what: "run the whole flow with a funded key" },
  { name: "list_sources", what: "chains a deposit can start from" },
  { name: "report_source_transaction", what: "hand the burn hash back to the relayer" },
  { name: "submit_gateway_intent", what: "submit the signed Gateway intent" },
  { name: "deposit_status", what: "follow a deposit all the way to the position" },
  { name: "uniswap_quote", what: "live pool price from the Uniswap Trading API" },
  { name: "fund_gateway_balance", what: "top up the unified balance before depositing" },
];

export const builtWith = [
  "Circle Gateway",
  "CCTP V2",
  "Arc",
  "Privy",
  "Uniswap Trading API",
  "Foundry",
  "OpenZeppelin",
  "viem",
  "wagmi",
  "Fastify",
  "Next.js",
  "Model Context Protocol",
];
