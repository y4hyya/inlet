import { describe, expect, it } from "vitest";
import { planRoute } from "../src/route.js";
import type { SourceChain } from "../src/types.js";

const base: SourceChain = { kind: "evm", domain: 6, chainId: 84532, name: "Base Sepolia", usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", tokenMessenger: "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA", gatewayWallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9", explorer: "" };
const arbitrum: SourceChain = { ...base, domain: 3, chainId: 421614, name: "Arbitrum Sepolia", usdc: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" };
const sources = [base, arbitrum];
const ten = 10_000_000n;

describe("planRoute", () => {
  it("uses the Gateway balance on the selected chain when it covers the amount", () => {
    const plan = planRoute({ preference: "auto", source: base, sources, sendAmount: ten, gatewayBalances: { 6: 17_480_000n, 3: 0n } });
    expect(plan).toMatchObject({ route: "gateway", sourceDomain: 6 });
  });

  it("moves to the chain that holds the Gateway balance when the selected chain has none", () => {
    const plan = planRoute({ preference: "auto", source: arbitrum, sources, sendAmount: ten, gatewayBalances: { 6: 17_480_000n, 3: 0n } });
    expect(plan).toMatchObject({ route: "gateway", sourceDomain: 6 });
  });

  it("falls back to CCTP on the selected chain when no Gateway balance covers the amount", () => {
    const plan = planRoute({ preference: "auto", source: arbitrum, sources, sendAmount: ten, gatewayBalances: { 6: 5_000_000n, 3: 0n } });
    expect(plan).toMatchObject({ route: "cctp", sourceDomain: 3 });
  });

  it("counts the Gateway fee when deciding whether a balance covers the amount", () => {
    const plan = planRoute({ preference: "auto", source: base, sources, sendAmount: ten, gatewayBalances: { 6: ten, 3: 0n } });
    expect(plan.route).toBe("cctp");
  });

  it("keeps an explicit Gateway choice on the selected chain and points at the chain that could pay", () => {
    const plan = planRoute({ preference: "gateway", source: arbitrum, sources, sendAmount: ten, gatewayBalances: { 6: 17_480_000n, 3: 0n } });
    expect(plan).toMatchObject({ route: "gateway", sourceDomain: 3, gatewayElsewhere: 6 });
  });

  it("keeps an explicit CCTP choice even when a Gateway balance exists", () => {
    const plan = planRoute({ preference: "cctp", source: base, sources, sendAmount: ten, gatewayBalances: { 6: 17_480_000n } });
    expect(plan).toMatchObject({ route: "cctp", sourceDomain: 6 });
  });
});
