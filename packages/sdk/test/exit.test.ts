import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, hashDomain, http, type Address } from "viem";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import { describe, expect, it } from "vitest";
import {
  adapterId,
  erc4626ExitData,
  exitableDestinations,
  hashExit,
  inletExitAbi,
  parseExit,
  permitAbi,
  permitTypedData,
  serializeExit,
  toBytes32,
  type ExitIntent,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "..", "..", "..", "contracts", "test", "fixtures", "exit-hash.json");
const fixture = existsSync(fixturePath) ? (JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>) : undefined;
if (!fixture) console.log(`skipping the exit hash parity test, ${fixturePath} is not written yet, run the Foundry fixture test first`);

const eip712Domain = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

const owner: Address = "0x31b1610Ec633Ed09Ce15dfDf697DD631daa3Bd02";
const aToken: Address = "0x460b97BD498E1157530AEb3086301d5225b91216";
const morphoVault: Address = "0x405baEeC864F9FA12AB031e69f2a1Aa2e4Add240";

const intent: ExitIntent = {
  owner,
  adapterId: adapterId("erc4626-exit:v1"),
  adapterData: erc4626ExitData(morphoVault),
  amount: 999866200508818015n,
  minAssets: 998000n,
  legs: [
    { domain: 6, recipient: toBytes32(owner), amount: 500_000n },
    { domain: 0, recipient: toBytes32(owner), amount: 0n },
  ],
  nonce: 42n,
  deadline: 1_800_000_000n,
  maxFeeBps: 2,
};

describe("exit helpers", () => {
  it.skipIf(!fixture)("hashes an exit intent exactly like ExitTypes.sol", () => {
    const raw = (fixture!.intent ?? fixture) as Record<string, unknown>;
    const fixed = parseExit(raw);
    expect(hashExit(fixed, fixture!.verifyingContract as Address, Number(fixture!.chainId))).toBe(fixture!.hash);
  });

  it("round trips an intent through the wire form", () => {
    expect(parseExit(JSON.parse(JSON.stringify(serializeExit(intent))) as Record<string, unknown>)).toEqual(intent);
  });
});

const morpho = exitableDestinations.find((entry) => entry.id === "morpho-oneshot-base-sepolia");
if (!morpho) console.log("skipping the live exit parity test, config/deployments.testnet.json has no inletExit on Base Sepolia yet");

describe("parity with the deployed exit", () => {
  it.skipIf(!morpho)("hashes an exit exactly like the InletExit on Base Sepolia", async () => {
    const client = createPublicClient({ chain: baseSepolia, transport: http() });
    const live = { ...intent, adapterId: morpho!.exit.adapterId, adapterData: morpho!.exit.adapterData };
    const onChain = await client.readContract({ address: morpho!.exit.exitContract, abi: inletExitAbi, functionName: "hashExit", args: [live] });
    expect(hashExit(live, morpho!.exit.exitContract, baseSepolia.id)).toBe(onChain);
  }, 30_000);
});

describe("permit domains on the live position tokens", () => {
  it("matches the Aave aToken on Arbitrum Sepolia", async () => {
    const client = createPublicClient({ chain: arbitrumSepolia, transport: http() });
    const onChain = await client.readContract({ address: aToken, abi: permitAbi, functionName: "DOMAIN_SEPARATOR" });
    const typedData = permitTypedData({
      name: "Aave Arbitrum Sepolia USDC",
      chainId: arbitrumSepolia.id,
      verifyingContract: aToken,
      owner,
      spender: owner,
      value: 1n,
      nonce: 0n,
      deadline: 1_800_000_000n,
    });
    expect(hashDomain({ domain: typedData.domain, types: eip712Domain })).toBe(onChain);
  }, 30_000);

  it("matches the Morpho Oneshot vault on Base Sepolia", async () => {
    const client = createPublicClient({ chain: baseSepolia, transport: http() });
    const onChain = await client.readContract({ address: morphoVault, abi: permitAbi, functionName: "DOMAIN_SEPARATOR" });
    const typedData = permitTypedData({
      name: "Oneshot Vault",
      version: "1",
      chainId: baseSepolia.id,
      verifyingContract: morphoVault,
      owner,
      spender: owner,
      value: 1n,
      nonce: 0n,
      deadline: 1_800_000_000n,
    });
    expect(hashDomain({ domain: typedData.domain, types: eip712Domain })).toBe(onChain);
  }, 30_000);
});
