import type { CSSProperties } from "react";

export function short(hash: string, head = 6, tail = 4) {
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function delay(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}
