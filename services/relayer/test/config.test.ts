import { networks, testnetDeployments } from "@inletkit/sdk";
import { describe, expect, it } from "vitest";
import { loadConfig, rpcVariable } from "../src/config.js";

const key = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const hub = "0x3333333333333333333333333333333333333333";
const receiver = "0x4444444444444444444444444444444444444444";

const mainnet = { ...networks.mainnet, hub: { ...networks.mainnet.hub, address: hub as `0x${string}` }, deployments: { arcMainnet: { inletHub: hub }, arbitrum: { inletReceiver: receiver } } };

describe("loadConfig", () => {
  it("serves testnet when NETWORK is unset", () => {
    const config = loadConfig({ RELAYER_PRIVATE_KEY: key });
    expect(config.network).toBe("testnet");
    expect(config.hub).toBe(testnetDeployments.arcTestnet.inletHub);
    expect(config.irisApi).toBe("https://iris-api-sandbox.circle.com");
    expect(config.rpc[26]).toBe("https://rpc.testnet.arc.io");
    expect(config.receivers[3]).toBe(testnetDeployments.arbitrumSepolia.inletReceiver);
  });

  it("serves the mainnet hub, hosts and chains when NETWORK is mainnet", () => {
    const config = loadConfig({ NETWORK: "mainnet", RELAYER_PRIVATE_KEY: key, ARBITRUM_RPC: "https://paid.example/arb" }, mainnet);
    expect(config.network).toBe("mainnet");
    expect(config.hub).toBe(hub);
    expect(config.hubDomain).toBe(26);
    expect(config.irisApi).toBe("https://iris-api.circle.com");
    expect(config.gatewayApi).toBe("https://gateway-api.circle.com");
    expect(config.rpc).toEqual({ 26: "https://rpc.mainnet.arc.io", 3: "https://paid.example/arb" });
    expect(config.receivers).toEqual({ 3: receiver });
    expect(config.exits).toEqual({});
  });

  it("refuses to start on mainnet when the deployment file has no hub", () => {
    const unset = { ...networks.mainnet, hub: { ...networks.mainnet.hub, address: undefined }, deployments: { arcMainnet: {}, arbitrum: {} } };
    expect(() => loadConfig({ NETWORK: "mainnet", RELAYER_PRIVATE_KEY: key }, unset)).toThrow(/not deployed on mainnet/);
  });

  it("refuses a network it does not know", () => {
    expect(() => loadConfig({ NETWORK: "devnet", RELAYER_PRIVATE_KEY: key })).toThrow(/testnet or mainnet/);
  });

  it("names the RPC variables after the config keys", () => {
    expect(rpcVariable("arcTestnet")).toBe("ARC_RPC");
    expect(rpcVariable("arcMainnet")).toBe("ARC_RPC");
    expect(rpcVariable("baseSepolia")).toBe("BASE_SEPOLIA_RPC");
    expect(rpcVariable("monadTestnet")).toBe("MONAD_TESTNET_RPC");
    expect(rpcVariable("arbitrum")).toBe("ARBITRUM_RPC");
  });
});
