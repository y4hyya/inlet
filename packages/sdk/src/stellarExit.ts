import type { Hex } from "viem";
import { stellarAccountToBytes32 } from "./stellar.js";

export interface StellarExitLeg {
  domain: number;
  // Left padded EVM address, the 32 bytes a CCTP message carries.
  recipient: Hex;
  // Six decimals, the units a CCTP message carries and what lands on the destination chain.
  amount: bigint;
}

export interface StellarExitParams {
  rpc: string;
  passphrase: string;
  exit: string;
  trader: string;
  legs: StellarExitLeg[];
  maxFee?: bigint;
  minFinality?: number;
  fee?: string;
}

export interface StellarSigner {
  (xdr: string, options: { networkPassphrase: string; address: string }): Promise<string | { signedTxXdr: string }>;
}

/// Circle attests a Stellar burn at the standard threshold in about five seconds and charges nothing for it.
export const stellarStandardFinality = 2000;

async function stellar() {
  return import("@stellar/stellar-sdk");
}

async function assemble(params: StellarExitParams) {
  const { Address, BASE_FEE, Contract, TransactionBuilder, nativeToScVal, rpc, xdr } = await stellar();
  if (params.legs.length === 0) throw new Error("an exit needs at least one leg");
  stellarAccountToBytes32(params.trader);

  // A struct travels as a map with its field names as symbols, in the order the contract declares them alphabetically.
  const legs = params.legs.map((leg) => {
    const fields: [string, ReturnType<typeof nativeToScVal>][] = [
      ["amount", nativeToScVal(leg.amount, { type: "i128" })],
      ["domain", nativeToScVal(leg.domain, { type: "u32" })],
      ["recipient", nativeToScVal(Buffer.from(leg.recipient.slice(2), "hex"), { type: "bytes" })],
    ];
    fields.sort(([left], [right]) => (left < right ? -1 : 1));
    return xdr.ScVal.scvMap(fields.map(([name, value]) => new xdr.ScMapEntry({ key: nativeToScVal(name, { type: "symbol" }), val: value })));
  });

  const server = new rpc.Server(params.rpc);
  const account = await server.getAccount(params.trader);
  const call = new Contract(params.exit).call(
    "execute",
    new Address(params.trader).toScVal(),
    xdr.ScVal.scvVec(legs),
    nativeToScVal(params.maxFee ?? 0n, { type: "i128" }),
    nativeToScVal(params.minFinality ?? stellarStandardFinality, { type: "u32" }),
  );
  const built = new TransactionBuilder(account, { fee: params.fee ?? BASE_FEE, networkPassphrase: params.passphrase })
    .addOperation(call)
    .setTimeout(120)
    .build();
  return { server, built };
}

const refusals: Record<string, string> = {
  "76": "That is more than this account holds.",
  "77": "That is more than the position can release while a trade is open.",
  "90": "The market is paused, so nothing can be taken out right now.",
  "2": "Enter an amount above zero.",
};

function readRefusal(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const code = text.match(/Error\(Contract, #(\d+)\)/)?.[1];
  if (code && refusals[code]) return refusals[code];
  return code ? `The market refused this withdrawal, error ${code}.` : text.split("\n")[0].slice(0, 200);
}

/// Asks the network whether this exact exit would work, without sending anything and without asking the wallet.
export async function simulateStellarExit(params: StellarExitParams): Promise<{ ok: boolean; error?: string }> {
  const { rpc } = await stellar();
  try {
    const { server, built } = await assemble(params);
    const simulation = await server.simulateTransaction(built);
    if (rpc.Api.isSimulationError(simulation)) return { ok: false, error: readRefusal(new Error(simulation.error)) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: readRefusal(error) };
  }
}

/// Builds the one transaction a trader signs: the withdrawal and every burn, prepared and ready to sign.
export async function buildStellarExit(params: StellarExitParams): Promise<string> {
  const { server, built } = await assemble(params);
  try {
    // Preparing fills in the authorisation tree and the footprint, so the trader's one signature covers the market call too.
    return (await server.prepareTransaction(built)).toXDR();
  } catch (error) {
    throw new Error(readRefusal(error));
  }
}

/// What the trader can take out. The market's free margin view is the honest ceiling; without it the balance view is
/// all there is, and that one counts an open position's collateral and profit, so it is only an upper bound.
export async function readStellarMargin(params: { rpc: string; passphrase: string; exit: string; trader: string }): Promise<{ amount: bigint; exact: boolean }> {
  const { Account, BASE_FEE, Contract, TransactionBuilder, nativeToScVal, rpc, scValToNative } = await stellar();
  const server = new rpc.Server(params.rpc);
  const read = async (contract: string, method: string, args: ReturnType<typeof nativeToScVal>[] = []) => {
    const call = new Contract(contract).call(method, ...args);
    const built = new TransactionBuilder(new Account(params.trader, "0"), { fee: BASE_FEE, networkPassphrase: params.passphrase }).addOperation(call).setTimeout(30).build();
    const simulation = await server.simulateTransaction(built);
    if (rpc.Api.isSimulationError(simulation) || !simulation.result) throw new Error(`${method} could not be read on ${contract}`);
    return scValToNative(simulation.result.retval);
  };
  const market: string = (await read(params.exit, "config")).market;
  const trader = [nativeToScVal(params.trader, { type: "address" })];
  try {
    return { amount: BigInt(await read(market, "get_cross_free_margin", trader)), exact: true };
  } catch {
    return { amount: BigInt(await read(market, "get_cross_margin_balance", trader)), exact: false };
  }
}

/// Sends a signed exit and waits for the ledger to close, returning the transaction hash.
export async function sendStellarExit(params: { rpc: string; passphrase: string; signedXdr: string }): Promise<string> {
  const { TransactionBuilder, rpc } = await stellar();
  const server = new rpc.Server(params.rpc);
  const transaction = TransactionBuilder.fromXDR(params.signedXdr, params.passphrase);
  const sent = await server.sendTransaction(transaction);
  if (sent.status === "ERROR") throw new Error(`Stellar refused the exit ${sent.hash}`);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const found = await server.getTransaction(sent.hash);
    if (found.status === rpc.Api.GetTransactionStatus.SUCCESS) return sent.hash;
    if (found.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`the exit failed in ${sent.hash}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Stellar did not confirm ${sent.hash} in time`);
}

/// Signs with whatever the host gave us: a wallet kit returns an object, a plain signer a string.
export async function signStellarExit(params: { xdr: string; passphrase: string; trader: string; sign: StellarSigner }): Promise<string> {
  const signed = await params.sign(params.xdr, { networkPassphrase: params.passphrase, address: params.trader });
  return typeof signed === "string" ? signed : signed.signedTxXdr;
}
