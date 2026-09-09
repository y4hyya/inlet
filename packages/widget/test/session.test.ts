import { describe, expect, it } from "vitest";
import { isSignedIn } from "../src/session.js";

const address = "0xFDeA5e1111111111111111111111111116A3813";

describe("isSignedIn", () => {
  it("is false when no wallet reports an address", () => {
    expect(isSignedIn({ address: undefined, authenticated: true, isConnected: true })).toBe(false);
  });

  it("is false once the host ends the session, even while the wallet stays connected", () => {
    expect(isSignedIn({ address, authenticated: false, isConnected: true })).toBe(false);
  });

  it("is true while the host session is open", () => {
    expect(isSignedIn({ address, authenticated: true, isConnected: true })).toBe(true);
  });

  it("falls back to the wallet connection when the host tracks no session", () => {
    expect(isSignedIn({ address, authenticated: undefined, isConnected: true })).toBe(true);
    expect(isSignedIn({ address, authenticated: undefined, isConnected: false })).toBe(false);
  });
});
