import { afterEach, describe, expect, it, vi } from "vitest";
import { IrisClient, IrisUnavailableError, flattenBody } from "../src/circle.js";

const lockout = `<!DOCTYPE html>\r\n<html lang=en><head><title>Lockout</title>\r\n<style>@charset "UTF-8";/*!\r\n * Bootstrap v5.0.0 (https://getbootstrap.com/)\r\n */</style></head></html>`;

function answer(status: number, body: string, json?: unknown) {
  vi.stubGlobal("fetch", async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => json,
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("flattenBody", () => {
  it("leaves nothing of an HTML page but the words", () => {
    expect(flattenBody(lockout)).toBe('Lockout @charset "UTF-8";/*! * Bootstrap v5.0.0 (https://getbootstrap.com/) */');
  });

  it("caps what it returns", () => {
    expect(flattenBody("x".repeat(400)).length).toBe(161);
  });
});

describe("IrisClient", () => {
  it("reads Circle being down as a wait, not a verdict on the transfer", async () => {
    answer(503, "<html><body>503 Service Temporarily Unavailable</body></html>");
    const error = await new IrisClient("https://iris").getMessages(26, "0xabc").catch((thrown) => thrown);
    expect(error).toBeInstanceOf(IrisUnavailableError);
    expect((error as IrisUnavailableError).status).toBe(503);
  });

  it("says Circle is unavailable without quoting the page it answered with", async () => {
    answer(504, lockout);
    const error = await new IrisClient("https://iris").getBurnFees(26, 27).catch((thrown) => thrown);
    expect((error as Error).message).toBe("Circle's attestation service is unavailable, retrying");
    expect((error as Error).message).not.toContain("Bootstrap");
  });

  it("keeps the body for the log", async () => {
    answer(502, lockout);
    const error = (await new IrisClient("https://iris").getMessages(26, "0xabc").catch((thrown) => thrown)) as IrisUnavailableError;
    expect(error.body).toContain("Bootstrap");
  });

  it("reports a request the caller got wrong in one flat line", async () => {
    answer(400, "<html><body>transactionHash is not valid</body></html>");
    const error = await new IrisClient("https://iris").getMessages(26, "nonsense").catch((thrown) => thrown);
    expect((error as Error).message).toBe("Iris 400: transactionHash is not valid");
    expect(error).not.toBeInstanceOf(IrisUnavailableError);
  });

  it("still reads a transaction Circle has never seen as nothing attested yet", async () => {
    answer(404, "");
    expect(await new IrisClient("https://iris").getMessages(26, "0xabc")).toEqual([]);
  });
});
