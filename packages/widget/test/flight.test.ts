import type { ExitRecord, IntentRecord } from "@inletkit/sdk";
import { describe, expect, it } from "vitest";
import { morphoBaseSepoliaDestination } from "../src/config.js";
import { flightKey, flightLabel, flightTtl, isTerminal, parseFlight } from "../src/flight.js";

const hash = "0xb21b5cc488f1e3bb2894aadeabeb9edbfce1223ee141280b07063a28a684ebd3" as const;
const destination = morphoBaseSepoliaDestination;

function deposit(state: IntentRecord["state"], extra: Partial<IntentRecord> = {}): IntentRecord {
  return {
    hash,
    state,
    route: "gateway",
    intent: { owner: "0x0000000000000000000000000000000000000001", sourceDomain: 6, destinationDomain: 6, adapterId: "0x", receiver: "0x", beneficiary: "0x", adapterData: "0x", amount: 1n, nonce: 1n, deadline: 1n, refundRecipient: "0x", feeBps: 0 },
    depositAddress: "0x0000000000000000000000000000000000000002",
    createdAt: 1_000_000,
    updatedAt: 1_042_000,
    ...extra,
  };
}

function withdrawal(state: ExitRecord["state"], extra: Partial<ExitRecord> = {}): ExitRecord {
  return {
    hash,
    state,
    domain: 3,
    intent: { owner: "0x0000000000000000000000000000000000000001", adapterId: "0x", adapterData: "0x", amount: 1n, minAssets: 1n, legs: [], nonce: 1n, deadline: 1n, maxFeeBps: 0 },
    executor: "0x0000000000000000000000000000000000000003",
    legs: [{ domain: 15, recipient: "0x", amount: 0n, attested: true, mintTx: "0x12d1b4ddd6bedafb90ab23253c70ca3d2b753f189475ba93f9b0e44c55d291a7" }],
    createdAt: 1_000_000,
    updatedAt: 1_013_000,
    ...extra,
  };
}

describe("flightKey", () => {
  it("names the action and the destination", () => {
    expect(flightKey("deposit", "morpho-oneshot-base-sepolia")).toBe("inlet:flight:deposit:morpho-oneshot-base-sepolia");
    expect(flightKey("withdraw", "my-vault")).toBe("inlet:flight:withdraw:my-vault");
  });
});

describe("isTerminal", () => {
  it("ends a deposit at executed, claimable, refunded, expired or failed", () => {
    for (const state of ["executed", "claimable", "refunded", "expired", "failed"]) expect(isTerminal("deposit", state)).toBe(true);
    for (const state of ["created", "funded", "swept", "attested", "refunding"]) expect(isTerminal("deposit", state)).toBe(false);
  });

  it("ends a withdrawal only at delivered", () => {
    expect(isTerminal("withdraw", "delivered")).toBe(true);
    for (const state of ["signed", "executed", "attested"]) expect(isTerminal("withdraw", state)).toBe(false);
  });
});

describe("flightLabel", () => {
  it("counts the seconds while in flight, from the record or from the stored start", () => {
    expect(flightLabel({ action: "deposit", destination, record: deposit("swept"), startedAt: 0, now: 1_018_000 })).toEqual({ text: "Deposit in flight · 18s", tone: "flying" });
    expect(flightLabel({ action: "withdraw", destination, startedAt: 1_000_000, now: 1_005_400 })).toEqual({ text: "Withdrawal in flight · 5s", tone: "flying" });
  });

  it("names the position with its link once delivered", () => {
    const label = flightLabel({ action: "deposit", destination, record: deposit("executed", { destinationTx: "0xabc0000000000000000000000000000000000000000000000000000000000def" }), startedAt: 0, now: 0 });
    expect(label.text).toBe("vUSDC shares delivered · 42s");
    expect(label.tone).toBe("done");
    expect(label.link).toEqual({ href: `${destination.explorer}0xabc0000000000000000000000000000000000000000000000000000000000def`, text: "0xabc000…000def" });
  });

  it("names the landing chains with the first mint once a withdrawal is delivered", () => {
    const label = flightLabel({ action: "withdraw", destination, record: withdrawal("delivered"), startedAt: 0, now: 0 });
    expect(label.text).toBe("USDC landed on Monad Testnet · 13s");
    expect(label.tone).toBe("done");
    expect(label.link?.href).toContain("0x12d1b4ddd6bedafb90ab23253c70ca3d2b753f189475ba93f9b0e44c55d291a7");
  });

  it("uses the form's wording for the other endings", () => {
    expect(flightLabel({ action: "deposit", destination, record: deposit("claimable"), startedAt: 0, now: 0 }).text).toBe("Adapter could not deposit, funds are claimable · 42s");
    expect(flightLabel({ action: "deposit", destination, record: deposit("refunded"), startedAt: 0, now: 0 })).toMatchObject({ text: "Refund delivered on the source chain · 42s", tone: "warn" });
    expect(flightLabel({ action: "deposit", destination, record: deposit("expired"), startedAt: 0, now: 0 }).text).toBe("Deadline passed with nothing to route · 42s");
    expect(flightLabel({ action: "deposit", destination, record: deposit("failed"), startedAt: 0, now: 0 }).text).toBe("Failed · 42s");
  });

  it("links a refund to its mint on the source chain unless it is manual", () => {
    const mint = "0x9990000000000000000000000000000000000000000000000000000000000999";
    expect(flightLabel({ action: "deposit", destination, record: deposit("refunded", { refundMintTx: mint }), startedAt: 0, now: 0 }).link?.href).toContain(mint);
    expect(flightLabel({ action: "deposit", destination, record: deposit("refunded", { refundMintTx: "manual" }), startedAt: 0, now: 0 }).link).toBeUndefined();
  });
});

describe("parseFlight", () => {
  const stored = JSON.stringify({ action: "withdraw", hash, startedAt: 1_000_000 });

  it("reads a flight back within a day", () => {
    expect(parseFlight(stored, "withdraw", 1_000_000 + flightTtl)).toEqual({ action: "withdraw", hash, startedAt: 1_000_000 });
  });

  it("ignores a flight older than a day", () => {
    expect(parseFlight(stored, "withdraw", 1_000_001 + flightTtl)).toBeUndefined();
  });

  it("ignores the other action, a bad hash and anything unreadable", () => {
    expect(parseFlight(stored, "deposit", 1_000_000)).toBeUndefined();
    expect(parseFlight(JSON.stringify({ action: "withdraw", hash: "0x12", startedAt: 1 }), "withdraw", 1)).toBeUndefined();
    expect(parseFlight("{", "withdraw", 1)).toBeUndefined();
    expect(parseFlight(null, "withdraw", 1)).toBeUndefined();
  });
});
