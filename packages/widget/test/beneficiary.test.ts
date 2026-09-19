import { describe, expect, it } from "vitest";
import { intentBeneficiary } from "../src/beneficiary.js";

const wallet = "0xFDeA5eBbe7970A00792562e1C5299215CF6A3813";
const account = "GBA2B27EXW4N77G5TFBUDDOOLNOJKMONZ7V7IJ4ACKNLBLF6DPGTDF3U";

describe("intentBeneficiary", () => {
  it("is the connected wallet for an EVM destination", () => {
    expect(intentBeneficiary({}, wallet)?.toLowerCase()).toBe("0x000000000000000000000000fdea5ebbe7970a00792562e1c5299215cf6a3813");
    expect(intentBeneficiary({ family: "evm" }, wallet, account)?.toLowerCase()).toBe("0x000000000000000000000000fdea5ebbe7970a00792562e1c5299215cf6a3813");
  });

  it("is the raw key of the G account for a Stellar destination, whatever wallet pays", () => {
    expect(intentBeneficiary({ family: "stellar" }, wallet, account)).toBe("0x41a0ebe4bdb8dffcdd9943418dce5b5c9531cdcfebf42780129ab0acbe1bcd31");
  });

  it("is nothing until a valid G account is given", () => {
    expect(intentBeneficiary({ family: "stellar" }, wallet)).toBeUndefined();
    expect(intentBeneficiary({ family: "stellar" }, wallet, "CAZ2VUUIJMVF5YAQ64NG2OUYSKCINRHB4363QKO7CI74YSHG6PRQQJYH")).toBeUndefined();
    expect(intentBeneficiary({ family: "stellar" }, wallet, wallet)).toBeUndefined();
  });
});
