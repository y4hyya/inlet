import { describe, expect, it } from "vitest";
import { bytes32ToStellarAccount, bytes32ToStellarContract, isStellarAccount, stellarAccountToBytes32, stellarContractToBytes32 } from "../src/stellar.js";

const account = "GBA2B27EXW4N77G5TFBUDDOOLNOJKMONZ7V7IJ4ACKNLBLF6DPGTDF3U";
const accountKey = "0x41a0ebe4bdb8dffcdd9943418dce5b5c9531cdcfebf42780129ab0acbe1bcd31";
const contract = "CAZ2VUUIJMVF5YAQ64NG2OUYSKCINRHB4363QKO7CI74YSHG6PRQQJYH";
const contractId = "0x33aad2884b2a5ee010f71a6d3a98928486c4e1e6fdb829df123fcc48e6f3e308";

describe("Stellar addresses as 32 bytes", () => {
  it("reads the raw key out of a G account and writes it back", () => {
    expect(stellarAccountToBytes32(account)).toBe(accountKey);
    expect(bytes32ToStellarAccount(accountKey)).toBe(account);
  });

  it("reads the id out of a C contract and writes it back", () => {
    expect(stellarContractToBytes32(contract)).toBe(contractId);
    expect(bytes32ToStellarContract(contractId)).toBe(contract);
  });

  it("takes only a G account as a beneficiary", () => {
    expect(isStellarAccount(account)).toBe(true);
    expect(isStellarAccount(contract)).toBe(false);
    expect(isStellarAccount("MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK")).toBe(false);
    expect(isStellarAccount("0xFDeA5eBbe7970A00792562e1C5299215CF6A3813")).toBe(false);
  });

  it("refuses an account with one character changed", () => {
    expect(isStellarAccount(account.slice(0, -1) + "V")).toBe(false);
    expect(() => stellarContractToBytes32(account)).toThrow();
  });
});
