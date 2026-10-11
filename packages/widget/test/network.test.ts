import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { isAddress, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { arcFor, chainIdForDomain, chainNameForDomain, destinationsFor, explorersFor, sourcesFor } from "../src/config.js";
import { InletContext, useInlet } from "../src/context.js";

function Probe() {
  const { network } = useInlet();
  return createElement("span", null, network);
}

describe("network", () => {
  it("is testnet for a widget mounted without a provider", () => {
    expect(renderToString(createElement(Probe))).toBe("<span>testnet</span>");
  });

  it("is whatever the provider put in the context", () => {
    const tree = createElement(InletContext.Provider, { value: { relayerUrl: "", ready: true, network: "mainnet" } }, createElement(Probe));
    expect(renderToString(tree)).toBe("<span>mainnet</span>");
  });

  it("names mainnet chains, ids and explorers", () => {
    expect(chainNameForDomain(3, "mainnet")).toBe("Arbitrum One");
    expect(chainNameForDomain(26, "mainnet")).toBe("Arc");
    expect(chainIdForDomain(3, "mainnet")).toBe(42161);
    expect(chainIdForDomain(26, "mainnet")).toBe(5042);
    expect(explorersFor("mainnet")[26]).toBe("https://explorer.arc.io/tx/");
    expect(explorersFor("mainnet")[3]).toBe("https://arbiscan.io/tx/");
  });

  it("keeps the testnet answers when no network is named", () => {
    expect(chainNameForDomain(3)).toBe("Arbitrum Sepolia");
    expect(chainIdForDomain(26)).toBe(5042002);
    expect(explorersFor()[26]).toBe("https://testnet.arcscan.app/tx/");
    expect(sourcesFor().map((entry) => entry.domain)).toContain(6);
  });

  it("offers Arbitrum One over CCTP alone on mainnet", () => {
    const sources = sourcesFor("mainnet");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ kind: "evm", domain: 3, chainId: 42161, gatewayWallet: zeroAddress });
    expect(arcFor("mainnet")).toEqual({ gatewayMinter: zeroAddress, usdc: "0x3600000000000000000000000000000000000000" });
    expect(arcFor().gatewayMinter).not.toBe(zeroAddress);
  });

  it("never lists a destination without a deployed receiver", () => {
    for (const entry of destinationsFor("mainnet")) expect(isAddress(entry.receiver)).toBe(true);
    expect(destinationsFor("testnet").some((entry) => entry.id === "aave-v3-arbitrum-sepolia")).toBe(true);
  });
});
