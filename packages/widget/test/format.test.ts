import { describe, expect, it } from "vitest";
import { note } from "../src/format.js";

const lockout = `Iris 504: <!DOCTYPE html>\r\n<html lang=en><head><title>Lockout</title>\r\n<style>@charset "UTF-8";/*!\r\n * Bootstrap v5.0.0 (https://getbootstrap.com/)\r\n */</style></head></html>`;

describe("note", () => {
  it("says Circle is down in words instead of showing the page it answered with", () => {
    expect(note(lockout)).toBe("Circle's attestation service is unavailable. The burn is done, so this keeps retrying until Circle answers.");
  });

  it("reads an nginx 503 the same way", () => {
    expect(note("<html><head><title>503 Service Temporarily Unavailable</title></head></html>")).toContain("Circle's attestation service is unavailable");
  });

  it("leaves a plain relayer message alone", () => {
    expect(note("sweep reverted in 0xabc")).toBe("sweep reverted in 0xabc");
  });

  it("never puts markup on the page", () => {
    expect(note("<img src=x onerror=alert(1)> something failed")).toBe("something failed");
  });

  it("caps a long message", () => {
    expect(note("y".repeat(400)).length).toBe(161);
  });
});
