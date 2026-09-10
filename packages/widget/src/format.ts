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
