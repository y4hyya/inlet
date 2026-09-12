import { gatewayMaxFee, hasGateway } from "@inletkit/sdk";
import type { Route } from "@inletkit/sdk";
import type { RoutePreference, SourceChain } from "./types.js";

export interface RoutePlan {
  route: Route;
  sourceDomain: number;
  gatewayFee: bigint;
  gatewayElsewhere?: number;
}

/// Gateway balances are per chain and a burn intent is only a signature, so the best route may use another chain's balance than the one selected.
export function planRoute(params: {
  preference: RoutePreference;
  source: SourceChain;
  sources: SourceChain[];
  sendAmount: bigint;
  gatewayBalances: Record<number, bigint>;
}): RoutePlan {
  const { preference, source, sources, sendAmount, gatewayBalances } = params;
  const covers = (domain: number) => (gatewayBalances[domain] ?? 0n) >= sendAmount + gatewayMaxFee(domain, sendAmount);
  const gatewayHere = hasGateway(source);
  const elsewhere = sources.find((entry) => entry.domain !== source.domain && hasGateway(entry) && covers(entry.domain));

  if (preference === "cctp" || !gatewayHere) return { route: "cctp", sourceDomain: source.domain, gatewayFee: gatewayMaxFee(source.domain, sendAmount) };
  if (preference === "gateway") {
    return { route: "gateway", sourceDomain: source.domain, gatewayFee: gatewayMaxFee(source.domain, sendAmount), gatewayElsewhere: covers(source.domain) ? undefined : elsewhere?.domain };
  }
  if (covers(source.domain)) return { route: "gateway", sourceDomain: source.domain, gatewayFee: gatewayMaxFee(source.domain, sendAmount) };
  if (elsewhere) return { route: "gateway", sourceDomain: elsewhere.domain, gatewayFee: gatewayMaxFee(elsewhere.domain, sendAmount) };
  return { route: "cctp", sourceDomain: source.domain, gatewayFee: gatewayMaxFee(source.domain, sendAmount) };
}
