import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  chainsFor,
  explorerLink,
  hasGateway,
  mainnetCatalog,
  mainnetDestinations,
  mainnetSources,
  networks,
  parseNetwork,
  testnetDeployments,
} from "../src/index.js";

const receiver = "0x1111111111111111111111111111111111111111";
const exit = "0x2222222222222222222222222222222222222222";

describe("mainnetCatalog", () => {
  it("offers Aave on Arbitrum One once the receiver and the exit are recorded", () => {
    const [aave, ...rest] = mainnetCatalog({ arbitrum: { inletReceiver: receiver, inletExit: exit } });
    expect(rest).toEqual([]);
    expect(aave).toMatchObject({ id: "aave-v3-arbitrum", destinationDomain: 3, chainId: 42161, receiver, explorer: "https://arbiscan.io/tx/", adapterName: "aave-v3:v1" });
    expect(aave.exit).toMatchObject({ adapterName: "aave-v3-exit:v1", exitContract: exit, permit: "eip2612", positionDecimals: 6 });
  });

  it("keeps the deposit side without an exit until the InletExit exists", () => {
    const [aave] = mainnetCatalog({ arbitrum: { inletReceiver: receiver } });
    expect(aave.receiver).toBe(receiver);
    expect(aave.exit).toBeUndefined();
  });

  it("offers nothing on a chain with no receiver", () => {
    expect(mainnetCatalog({})).toEqual([]);
    expect(mainnetCatalog({ arbitrum: {} })).toEqual([]);
  });

  it("never carries a placeholder into the live catalog", () => {
    for (const entry of mainnetDestinations) expect(isAddress(entry.receiver)).toBe(true);
  });
});

describe("networks", () => {
  it("reads the testnet hub from the deployment file", () => {
    expect(networks.testnet.hub).toMatchObject({ key: "arcTestnet", chainId: 5042002, cctpDomain: 26, address: testnetDeployments.arcTestnet.inletHub });
    expect(networks.testnet.circle.irisApi).toBe("https://iris-api-sandbox.circle.com");
  });

  it("describes Arc mainnet and its Circle hosts", () => {
    const { hub, circle } = networks.mainnet;
    expect(hub).toMatchObject({ key: "arcMainnet", chainId: 5042, cctpDomain: 26, usdc: "0x3600000000000000000000000000000000000000", rpc: "https://rpc.mainnet.arc.io" });
    expect(hub.address === undefined || isAddress(hub.address)).toBe(true);
    expect(circle).toEqual({ irisApi: "https://iris-api.circle.com", gatewayApi: "https://gateway-api.circle.com" });
  });

  it("only lists chains a client can be built for", () => {
    const keys = chainsFor("mainnet").map((chain) => chain.key).sort();
    expect(keys).toEqual(["arbitrum", "arcMainnet"]);
    for (const chain of [...chainsFor("mainnet"), ...chainsFor("testnet")]) expect(chain.rpc).toMatch(/^https:\/\//);
    expect(chainsFor("testnet").map((chain) => chain.key)).not.toContain("solanaDevnet");
  });

  it("treats an unset network as testnet and refuses anything else", () => {
    expect(parseNetwork(undefined)).toBe("testnet");
    expect(parseNetwork("")).toBe("testnet");
    expect(parseNetwork(" mainnet ")).toBe("mainnet");
    expect(() => parseNetwork("goerli")).toThrow(/testnet or mainnet/);
  });

  it("links mainnet hashes to the mainnet explorers", () => {
    expect(explorerLink(26, "0xabc", "mainnet")).toBe("https://explorer.arc.io/tx/0xabc");
    expect(explorerLink(3, "0xabc", "mainnet")).toBe("https://arbiscan.io/tx/0xabc");
    expect(explorerLink(26, "0xabc")).toBe("https://testnet.arcscan.app/tx/0xabc");
    expect(explorerLink(5, "sig")).toBe("https://explorer.solana.com/tx/sig?cluster=devnet");
  });

  it("starts mainnet from Arbitrum One over CCTP alone", () => {
    expect(mainnetSources).toHaveLength(1);
    expect(mainnetSources[0]).toMatchObject({ kind: "evm", domain: 3, chainId: 42161, name: "Arbitrum One" });
    expect(hasGateway(mainnetSources[0])).toBe(false);
  });
});
