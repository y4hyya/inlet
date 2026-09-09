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
    body: "The hub derives a deposit address on Arc from every parameter of the deposit.",
    actor: "contract",
    actorLabel: "Hub on Arc",
  },
  {
    id: "fund",
    number: "02",
    title: "Fund",
    body: "The user funds it in one action, through Gateway with no gas or through CCTP.",
    actor: "user",
    actorLabel: "User wallet",
  },
  {
    id: "sweep",
    number: "03",
    title: "Sweep",
    body: "Anyone can sweep it. The USDC burns toward the destination, intent attached.",
    actor: "relayer",
    actorLabel: "Relayer",
  },
  {
    id: "attest",
    number: "04",
    title: "Attest",
    body: "Circle attests the burn and the relayer submits the mint on the far chain.",
    actor: "circle",
    actorLabel: "Circle",
  },
  {
    id: "execute",
    number: "05",
    title: "Execute",
    body: "The receiver checks Circle minted it, then the adapter deposits in the user's name.",
    actor: "contract",
    actorLabel: "Receiver",
  },
  {
    id: "settle",
    number: "06",
    title: "Settle",
    body: "If anything fails the USDC waits to be claimed, or refunds after the deadline.",
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

export const builtWith = ["Circle Gateway", "CCTP V2", "Arc", "Privy", "Uniswap Trading API", "Model Context Protocol"];
