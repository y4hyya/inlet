import { formatUnits, parseUnits } from "viem";

export function usdc(value: bigint): string {
  return `${formatUnits(value, 6)} USDC`;
}

export function parseUsdc(input: string): bigint | undefined {
  try {
    const value = parseUnits(input.trim(), 6);
    return value > 0n ? value : undefined;
  } catch {
    return undefined;
  }
}

export function short(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

export function tokens(value: bigint, decimals: number, label: string): string {
  return `${formatUnits(value, decimals)} ${label}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split("\n")[0].slice(0, 240);
  return String(error).slice(0, 240);
}

/// A note the relayer recorded may quote a service that answered with an HTML page, so it is
/// flattened before it reaches the page and Circle being down is said in words instead.
export function note(message: string): string {
  const flat = message
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/iris|attestation service|temporarily unavailable|lockout|bad gateway/i.test(flat)) return "Circle's attestation service is unavailable. The burn is done, so this keeps retrying until Circle answers.";
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}
