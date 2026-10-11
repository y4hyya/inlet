import { exitableOf, networks, parseNetwork, type Network } from "@inletkit/sdk";

/// One server speaks for one network, testnet unless INLET_NETWORK says mainnet.
export const network: Network = parseNetwork(process.env.INLET_NETWORK);
const spec = networks[network];

export const destinations = spec.destinations;
export const exitableDestinations = exitableOf(destinations);

export const chainNames: Record<number, string> = { 26: network === "mainnet" ? "Arc" : "Arc Testnet" };
for (const source of spec.sources) chainNames[source.domain] = source.name;
for (const destination of destinations) chainNames[destination.destinationDomain] ??= destination.chain;

export interface TimelinePlan {
  title: string;
  steps: string[];
}

export function chainName(domain: number): string {
  return chainNames[domain] ?? `domain ${domain}`;
}

export function short(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function legLabel(domain: number, amountUsdc: string | undefined, last: boolean): string {
  return last ? `The rest landed on ${chainName(domain)}` : `${amountUsdc ?? "?"} USDC landed on ${chainName(domain)}`;
}

/// The stages a withdrawal reports, in order, so a client can draw the whole road before the first stage completes.
export function withdrawPlan(input: { destinationId?: string; amountUsdc?: string; legs?: { domain: number; amountUsdc?: string }[] }): TimelinePlan | undefined {
  const spec = exitableDestinations.find((entry) => entry.id === input.destinationId);
  if (!spec || !Array.isArray(input.legs)) return undefined;
  return {
    title: `withdraw  ${input.amountUsdc} USDC out of ${spec.name}`,
    steps: [
      "Exit built for the derived executor",
      spec.exit.permit === "comet" ? "Authorization signed for the executor" : "Permit signed for the executor",
      "Submitted to the relayer",
      `Redeemed on ${chainName(spec.destinationDomain)}`,
      "Circle attested",
      ...input.legs.map((leg, index) => legLabel(leg.domain, leg.amountUsdc, index + 1 === input.legs!.length)),
    ],
  };
}

export function depositPlan(input: { sourceDomain?: number; destinationId?: string; amountUsdc?: string }): TimelinePlan | undefined {
  const spec = destinations.find((entry) => entry.id === input.destinationId);
  if (!spec || typeof input.sourceDomain !== "number") return undefined;
  return {
    title: `deposit  ${input.amountUsdc} USDC from ${chainName(input.sourceDomain)} into ${spec.name}`,
    steps: [
      "Intent registered, deposit address derived on Arc",
      `USDC left ${chainName(input.sourceDomain)}`,
      "USDC landed on Arc",
      "Hub swept and burned toward the destination",
      "Circle attested the transfer",
      `${spec.positionLabel} delivered`,
    ],
  };
}

export function planFor(tool: string, args: Record<string, unknown>): TimelinePlan | undefined {
  if (tool === "withdraw") return withdrawPlan(args as Parameters<typeof withdrawPlan>[0]);
  if (tool === "deposit") return depositPlan(args as Parameters<typeof depositPlan>[0]);
  return undefined;
}
