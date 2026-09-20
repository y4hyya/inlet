import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetDeposit, recallDeposit, rememberDeposit } from "../src/pending.js";

const hash = "0xfdfce0ab3ab3b4674cc037021b2f5492dd83f828fdd343727df9cb1eb7c290db";

function fakeStorage(overrides: Partial<Storage> = {}) {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
    ...overrides,
  });
  return entries;
}

afterEach(() => vi.unstubAllGlobals());

describe("the pending deposit", () => {
  it("comes back after a reload", () => {
    fakeStorage();
    rememberDeposit("noether-cross-margin-stellar-testnet", hash);
    expect(recallDeposit("noether-cross-margin-stellar-testnet")).toBe(hash);
  });

  it("belongs to one destination", () => {
    fakeStorage();
    rememberDeposit("noether-cross-margin-stellar-testnet", hash);
    expect(recallDeposit("demo-vault")).toBeUndefined();
  });

  it("is gone once it is forgotten", () => {
    fakeStorage();
    rememberDeposit("demo-vault", hash);
    forgetDeposit("demo-vault");
    expect(recallDeposit("demo-vault")).toBeUndefined();
  });

  it("ignores anything that is not an intent hash", () => {
    const entries = fakeStorage();
    entries.set("inlet:deposit:demo-vault", "javascript:alert(1)");
    expect(recallDeposit("demo-vault")).toBeUndefined();
  });

  it("remembers nothing rather than breaking when the browser refuses storage", () => {
    fakeStorage({
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => rememberDeposit("demo-vault", hash)).not.toThrow();
    expect(recallDeposit("demo-vault")).toBeUndefined();
  });

  it("survives a page with no storage at all", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => rememberDeposit("demo-vault", hash)).not.toThrow();
    expect(recallDeposit("demo-vault")).toBeUndefined();
  });
});
