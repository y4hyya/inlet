import { isStellarAccount, stellarAccountToBytes32, toBytes32 } from "@inletkit/sdk";
import type { Address, Hex } from "viem";
import type { Destination } from "./types.js";

/// Who the position is for, as the 32 bytes the intent carries. On Stellar that is the raw key of a G account, never the EVM wallet that pays.
export function intentBeneficiary(destination: Pick<Destination, "family">, wallet?: Address, stellarAccount?: string): Hex | undefined {
  if (destination.family === "stellar") return stellarAccount && isStellarAccount(stellarAccount) ? stellarAccountToBytes32(stellarAccount) : undefined;
  return wallet ? toBytes32(wallet) : undefined;
}
