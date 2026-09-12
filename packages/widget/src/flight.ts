import { explorerLink, type ExitRecord, type IntentRecord } from "@inletkit/sdk";
import type { Hex } from "viem";
import { depositStateLabels } from "./components/StatusTimeline.js";
import { chainNameForDomain, explorers } from "./config.js";
import { short } from "./format.js";
import type { Destination } from "./types.js";

export type FlightAction = "deposit" | "withdraw";
export type FlightRecord = IntentRecord | ExitRecord;
export type FlightTone = "flying" | "done" | "warn";

export interface StoredFlight {
  action: FlightAction;
  hash: Hex;
  startedAt: number;
}

export interface FlightLabel {
  text: string;
  tone: FlightTone;
  link?: { href: string; text: string };
}

export const flightTtl = 24 * 60 * 60 * 1000;

const depositEnds = new Set(["executed", "claimable", "refunded", "expired", "failed"]);

export function flightKey(action: FlightAction, destinationId: string): string {
  return `inlet:flight:${action}:${destinationId}`;
}

export function isTerminal(action: FlightAction, state: string): boolean {
  return action === "deposit" ? depositEnds.has(state) : state === "delivered";
}

/// Reads a stored flight back, or nothing when it is missing, malformed, for another action, or older than a day.
export function parseFlight(raw: string | null | undefined, action: FlightAction, now: number): StoredFlight | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<StoredFlight>;
    if (value.action !== action || typeof value.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value.hash) || typeof value.startedAt !== "number") return undefined;
    if (now - value.startedAt > flightTtl) return undefined;
    return { action, hash: value.hash as Hex, startedAt: value.startedAt };
  } catch {
    return undefined;
  }
}

function took(from: number, to: number): string {
  return `${Math.max(1, Math.round((to - from) / 1000))}s`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function flightLabel(params: { action: FlightAction; destination: Destination; record?: FlightRecord; startedAt: number; now: number }): FlightLabel {
  const { action, destination, record, startedAt, now } = params;
  if (!record || !isTerminal(action, record.state)) {
    return { text: `${action === "deposit" ? "Deposit" : "Withdrawal"} in flight · ${took(record?.createdAt ?? startedAt, now)}`, tone: "flying" };
  }
  const time = took(record.createdAt, record.updatedAt);
  if ("legs" in record) {
    const landed = record.legs.find((leg) => leg.mintTx && String(leg.mintTx) !== "external");
    return {
      text: `USDC landed on ${list(record.legs.map((leg) => chainNameForDomain(leg.domain)))} · ${time}`,
      tone: "done",
      link: landed?.mintTx ? { href: explorers[landed.domain] + landed.mintTx, text: short(landed.mintTx) } : undefined,
    };
  }
  if (record.state === "executed") {
    return {
      text: `${destination.positionLabel} delivered · ${time}`,
      tone: "done",
      link: record.destinationTx ? { href: destination.explorer + record.destinationTx, text: short(record.destinationTx) } : undefined,
    };
  }
  const link =
    record.state === "refunded" && record.refundMintTx && record.refundMintTx !== "manual"
      ? { href: explorerLink(record.intent.sourceDomain, record.refundMintTx), text: short(record.refundMintTx) }
      : record.state === "claimable" && record.destinationTx
        ? { href: destination.explorer + record.destinationTx, text: short(record.destinationTx) }
        : undefined;
  return { text: `${depositStateLabels[record.state] ?? record.state} · ${time}`, tone: "warn", link };
}
