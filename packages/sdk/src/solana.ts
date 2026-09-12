import {
  AccountRole,
  address,
  appendTransactionMessageInstruction,
  createKeyPairFromBytes,
  createNoopSigner,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getAddressDecoder,
  getAddressEncoder,
  getBase58Decoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  getU32Encoder,
  getU64Encoder,
  partiallySignTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type AccountMeta,
  type AccountSignerMeta,
  type Address as SolanaAddress,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS, fetchMaybeToken, findAssociatedTokenPda } from "@solana-program/token";
import { bytesToHex, hexToBytes, pad, type Hex } from "viem";

export const solanaDomain = 5;

const systemProgram = "11111111111111111111111111111111";

const depositForBurnDiscriminator = new Uint8Array([215, 60, 61, 46, 114, 55, 128, 176]);

const seed = (value: string) => new TextEncoder().encode(value);

export interface SolanaCctp {
  rpc: string;
  usdcMint: string;
  tokenMessengerMinter: string;
  messageTransmitter: string;
}

export interface SolanaDepositForBurnParams {
  cctp: SolanaCctp;
  owner: string;
  amount: bigint;
  destinationDomain: number;
  mintRecipient: Hex;
  maxFee: bigint;
  minFinalityThreshold: number;
}

export async function solanaUsdcAccount(owner: string, usdcMint: string): Promise<string> {
  const [account] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(usdcMint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return account;
}

export async function solanaUsdcBalance(cctp: SolanaCctp, owner: string): Promise<bigint> {
  const rpc = createSolanaRpc(cctp.rpc);
  const account = await fetchMaybeToken(rpc, address(await solanaUsdcAccount(owner, cctp.usdcMint)));
  return account.exists ? account.data.amount : 0n;
}

export function solanaMintRecipient(evmAddress: Hex): string {
  return getAddressDecoder().decode(hexToBytes(pad(evmAddress, { size: 32 })));
}

export function bytes32FromSolanaAddress(value: string): Hex {
  return bytesToHex(new Uint8Array(getAddressEncoder().encode(address(value))));
}

export function solanaSignatureToBase58(bytes: Uint8Array): string {
  return getBase58Decoder().decode(bytes);
}

/// A secret as a wallet exports it, base58 of the 64 byte keypair, or the JSON array of a CLI keypair file.
export function solanaKeypairBytes(secret: string): Uint8Array {
  const trimmed = secret.trim();
  const bytes = trimmed.startsWith("[") ? Uint8Array.from(JSON.parse(trimmed) as number[]) : new Uint8Array(getBase58Encoder().encode(trimmed));
  if (bytes.length !== 64) throw new Error("a Solana keypair is 64 bytes, the secret key then the public key");
  return bytes;
}

export async function buildSolanaDepositForBurn(params: SolanaDepositForBurnParams): Promise<{ transaction: Uint8Array; eventAccount: string }> {
  const { cctp } = params;
  const rpc = createSolanaRpc(cctp.rpc);
  const tokenMessengerMinter = address(cctp.tokenMessengerMinter);
  const messageTransmitterProgram = address(cctp.messageTransmitter);
  const mint = address(cctp.usdcMint);
  const owner = createNoopSigner(address(params.owner));
  const eventAccount = await generateKeyPairSigner();
  const addresses = getAddressEncoder();

  const pda = async (programAddress: SolanaAddress, seeds: ReadonlyArray<Uint8Array | SolanaAddress>) => {
    const [value] = await getProgramDerivedAddress({
      programAddress,
      seeds: seeds.map((entry) => (typeof entry === "string" ? addresses.encode(entry) : entry)),
    });
    return value;
  };

  const [senderAuthority, denylist, messageTransmitter, tokenMessenger, remoteTokenMessenger, tokenMinter, localToken, eventAuthority, messageTransmitterEventAuthority] = await Promise.all([
    pda(tokenMessengerMinter, [seed("sender_authority")]),
    pda(tokenMessengerMinter, [seed("denylist_account"), owner.address]),
    pda(messageTransmitterProgram, [seed("message_transmitter")]),
    pda(tokenMessengerMinter, [seed("token_messenger")]),
    pda(tokenMessengerMinter, [seed("remote_token_messenger"), seed(params.destinationDomain.toString())]),
    pda(tokenMessengerMinter, [seed("token_minter")]),
    pda(tokenMessengerMinter, [seed("local_token"), mint]),
    pda(tokenMessengerMinter, [seed("__event_authority")]),
    pda(messageTransmitterProgram, [seed("__event_authority")]),
  ]);
  const burnTokenAccount = address(await solanaUsdcAccount(params.owner, cctp.usdcMint));

  const data = concat([
    depositForBurnDiscriminator,
    getU64Encoder().encode(params.amount),
    getU32Encoder().encode(params.destinationDomain),
    addresses.encode(address(solanaMintRecipient(params.mintRecipient))),
    new Uint8Array(32),
    getU64Encoder().encode(params.maxFee),
    getU32Encoder().encode(params.minFinalityThreshold),
  ]);

  const accounts: ReadonlyArray<AccountMeta | AccountSignerMeta> = [
    { address: owner.address, role: AccountRole.WRITABLE_SIGNER, signer: owner },
    { address: owner.address, role: AccountRole.WRITABLE_SIGNER, signer: owner },
    { address: senderAuthority, role: AccountRole.READONLY },
    { address: burnTokenAccount, role: AccountRole.WRITABLE },
    { address: denylist, role: AccountRole.READONLY },
    { address: messageTransmitter, role: AccountRole.WRITABLE },
    { address: tokenMessenger, role: AccountRole.READONLY },
    { address: remoteTokenMessenger, role: AccountRole.READONLY },
    { address: tokenMinter, role: AccountRole.READONLY },
    { address: localToken, role: AccountRole.WRITABLE },
    { address: mint, role: AccountRole.WRITABLE },
    { address: eventAccount.address, role: AccountRole.WRITABLE_SIGNER, signer: eventAccount },
    { address: messageTransmitterProgram, role: AccountRole.READONLY },
    { address: tokenMessengerMinter, role: AccountRole.READONLY },
    { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    { address: address(systemProgram), role: AccountRole.READONLY },
    { address: eventAuthority, role: AccountRole.READONLY },
    { address: tokenMessengerMinter, role: AccountRole.READONLY },
    { address: messageTransmitterEventAuthority, role: AccountRole.READONLY },
    { address: messageTransmitterProgram, role: AccountRole.READONLY },
  ];

  const instruction = { programAddress: tokenMessengerMinter, accounts, data };

  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(owner, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
    (tx) => appendTransactionMessageInstruction(instruction, tx),
  );
  const signed = await partiallySignTransactionMessageWithSigners(message);
  return { transaction: new Uint8Array(getTransactionEncoder().encode(signed)), eventAccount: eventAccount.address };
}

export async function signSolanaDeposit(transaction: Uint8Array, keypairBytes: Uint8Array): Promise<Uint8Array> {
  const keypair = await createKeyPairFromBytes(keypairBytes);
  const signed = await partiallySignTransaction([keypair], getTransactionDecoder().decode(transaction));
  return new Uint8Array(getTransactionEncoder().encode(signed));
}

export async function sendSolanaTransaction(cctp: SolanaCctp, transaction: Uint8Array): Promise<string> {
  const rpc = createSolanaRpc(cctp.rpc);
  const decoded = getTransactionDecoder().decode(transaction);
  const signature = getSignatureFromTransaction(decoded);
  await rpc
    .sendTransaction(getBase64EncodedWireTransaction(decoded), { encoding: "base64", preflightCommitment: "confirmed" })
    .send();
  for (let attempt = 0; attempt < 120; attempt++) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error(`Solana transaction ${signature} failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Solana transaction ${signature} was not confirmed in time`);
}

export async function simulateSolanaDeposit(cctp: SolanaCctp, transaction: Uint8Array): Promise<{ ok: boolean; logs: string[]; error?: string }> {
  const rpc = createSolanaRpc(cctp.rpc);
  const decoded = getTransactionDecoder().decode(transaction);
  const { value } = await rpc
    .simulateTransaction(getBase64EncodedWireTransaction(decoded), {
      encoding: "base64",
      commitment: "confirmed",
      replaceRecentBlockhash: true,
      sigVerify: false,
    })
    .send();
  return { ok: !value.err, logs: [...(value.logs ?? [])], error: value.err ? JSON.stringify(value.err) : undefined };
}

function concat(parts: ReadonlyArray<ArrayLike<number>>): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(Uint8Array.from(part), offset);
    offset += part.length;
  }
  return out;
}
