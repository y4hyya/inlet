import { InletRelayerClient, explorerLink, stellarAccountToBytes32, testnetDeployments, toBytes32, type ExitRecord } from "@inletkit/sdk";
import { buildStellarExit, sendStellarExit } from "@inletkit/sdk/stellar";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { createPublicClient, erc20Abi, http, type Address } from "viem";
import { loadConfig } from "../src/config.js";
import { createRelayer } from "../src/relayer.js";
import { pickSource } from "./destinations.js";

const config = loadConfig();
if (!config.stellar) throw new Error("STELLAR_SECRET_KEY is not set, so this relayer has no Stellar leg");
const secret = process.env.STELLAR_TRADER_SECRET ?? config.stellar.secret;
const trader = Keypair.fromSecret(secret);
const amount = BigInt(process.env.E2E_AMOUNT ?? "500000");
const landing = pickSource();
const recipient = (process.env.E2E_RECIPIENT ?? "") as Address;
if (!recipient) throw new Error("E2E_RECIPIENT is not set, so nothing would receive the USDC");

const publicClient = createPublicClient({ chain: landing.chain, transport: http(config.rpc[landing.domain] ?? landing.rpc) });
const remote = process.env.RELAYER_URL;
const relayer = remote ? { url: remote, stop: async () => {} } : await createRelayer(config).start();
const client = new InletRelayerClient(relayer.url);
console.log(`relayer ${relayer.url}${remote ? " (remote)" : ""}, trader ${trader.publicKey()}, ${Number(amount) / 1e6} USDC out to ${recipient} on ${landing.chain.name}`);
const started = Date.now();
const stamp = () => `${Math.round((Date.now() - started) / 1000)}s`;

async function held(): Promise<bigint> {
  return publicClient.readContract({ address: landing.usdc, abi: erc20Abi, functionName: "balanceOf", args: [recipient] });
}

try {
  stellarAccountToBytes32(trader.publicKey());
  const before = await held();
  const xdr = await buildStellarExit({
    rpc: config.stellar.rpc,
    passphrase: config.stellar.passphrase,
    exit: config.stellar.exit,
    trader: trader.publicKey(),
    legs: [{ domain: landing.domain, recipient: toBytes32(recipient), amount }],
  });
  const transaction = TransactionBuilder.fromXDR(xdr, config.stellar.passphrase);
  transaction.sign(trader);
  const hash = await sendStellarExit({ rpc: config.stellar.rpc, passphrase: config.stellar.passphrase, signedXdr: transaction.toXDR() });
  const burned = Date.now();
  console.log(`${stamp()} signed and submitted on Stellar ${explorerLink(27, hash)}`);

  let record: ExitRecord = await client.createStellarExit(hash, trader.publicKey());
  let last = "";
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    record = await client.getExit(record.hash);
    const line = `${record.state} ${record.legs.map((leg) => `${leg.domain}:${leg.mintTx ?? "waiting"}`).join(" ")} ${record.error ?? ""}`.trim();
    if (line !== last) console.log(`${stamp()} ${line}`);
    last = line;
    if (record.state === "delivered") {
      console.log(`${Math.round((Date.now() - burned) / 1000)}s from the signature to the USDC`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log(`${stamp()} ${recipient} held ${before} before, ${await held()} after`);
} finally {
  await relayer.stop();
}
