// A deposit that was burned but not yet delivered has to survive a reload, so the intent hash is
// remembered per destination until the relayer reports a state that ends it. Storage can be blocked
// or full, and that must never stop a deposit, so every call falls back to remembering nothing.

const key = (destination: string) => `inlet:deposit:${destination}`;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberDeposit(destination: string, hash: string): void {
  try {
    storage()?.setItem(key(destination), hash);
  } catch {
    return;
  }
}

export function recallDeposit(destination: string): string | undefined {
  try {
    const hash = storage()?.getItem(key(destination));
    return hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : undefined;
  } catch {
    return undefined;
  }
}

export function forgetDeposit(destination: string): void {
  try {
    storage()?.removeItem(key(destination));
  } catch {
    return;
  }
}
