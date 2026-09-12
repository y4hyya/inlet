import { InletRelayerClient, IrisClient, buildSolanaDepositForBurn, bytes32FromSolanaAddress, findDestinationSpec, sendSolanaTransaction, signSolanaDeposit, simulateSolanaDeposit, solanaDomain, solanaKeypairBytes, solanaSignatureToBase58, solanaUsdcAccount, solanaUsdcBalance, testnetChains, toBytes32, type DepositIntent, type SolanaCctp } from "@inletkit/sdk";
import { readFileSync } from "node:fs";
import { formatUnits, parseUnits, type Address, type Hex } from "viem";

const hostedRelayer = "https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io";
const hubDomain = 26;

const solana = testnetChains.solanaDevnet;
const cctp: SolanaCctp = {
  rpc: process.env.SOLANA_RPC ?? solana.rpc,
  usdcMint: solana.usdc,
  tokenMessengerMinter: solana.tokenMessengerMinterV2,
  messageTransmitter: solana.messageTransmitterV2,
};

const aliases: Record<string, string> = {
  aave: "aave-v3-arbitrum-sepolia",
  compound: "compound-v3-base-sepolia",
  morpho: "morpho-oneshot-base-sepolia",
  uniswap: "uniswap-v4-eth-usdc-unichain-sepolia",
  euler: "euler-ethereum-sepolia",
  monad: "demo-vault-monad-testnet",
};

const key = process.env.DESTINATION ?? "aave-v3-arbitrum-sepolia";
const destination = findDestinationSpec(aliases[key] ?? key);
if (!destination) throw new Error(`DESTINATION must be a destination id or one of ${Object.keys(aliases).join(", ")}`);

const simulate = process.env.SIMULATE === "1";
const keypair = readKeypair(process.env.SOLANA_KEYPAIR, process.env.SOLANA_PRIVATE_KEY ?? process.env.TEST_SOL_PRIVATE_KEY ?? rootEnv("TEST_SOL_PRIVATE_KEY"));
const owner = process.env.OWNER ?? (keypair ? solanaSignatureToBase58(keypair.subarray(32)) : undefined);
if (!owner) throw new Error("set SOLANA_KEYPAIR to a keypair file or SOLANA_PRIVATE_KEY to the wallet's secret, or OWNER together with SIMULATE=1");
if (!simulate && !keypair) throw new Error("a keypair is required to send the burn; use SIMULATE=1 to only build it");

const beneficiary = (process.env.BENEFICIARY ?? process.env.TEST_PUBLIC_KEY ?? rootEnv("TEST_PUBLIC_KEY")) as Address | undefined;
if (!beneficiary) throw new Error("set BENEFICIARY to the EVM address that should own the position");

const burnAmount = parseUnits(process.env.AMOUNT ?? "1", 6);
const iris = new IrisClient(process.env.IRIS_API ?? testnetChains.circle.irisApi);
const relayerUrl = process.env.RELAYER_URL ?? hostedRelayer;
const client = new InletRelayerClient(relayerUrl);
const started = Date.now();
const stamp = () => `${Math.round((Date.now() - started) / 1000)}s`;

const burnTokenAccount = await solanaUsdcAccount(owner, cctp.usdcMint);
const balance = await solanaUsdcBalance(cctp, owner);
console.log(`relayer ${relayerUrl}, owner ${owner}, token account ${burnTokenAccount} holding ${formatUnits(balance, 6)} USDC, ${formatUnits(burnAmount, 6)} USDC into ${destination.name} for ${beneficiary}`);
if (balance < burnAmount) throw new Error(`the wallet holds ${formatUnits(balance, 6)} USDC and this deposit burns ${formatUnits(burnAmount, 6)}`);

const maxFee = await iris.fastTransferMaxFee(solanaDomain, hubDomain, burnAmount);
const intent: DepositIntent = {
  owner: beneficiary,
  sourceDomain: solanaDomain,
  destinationDomain: destination.destinationDomain,
  adapterId: destination.adapterId,
  receiver: toBytes32(destination.receiver),
  beneficiary: toBytes32(beneficiary),
  adapterData: destination.adapterData,
  amount: burnAmount - maxFee,
  nonce: BigInt(Date.now()),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 2 * 3600),
  refundRecipient: bytes32FromSolanaAddress(burnTokenAccount),
  feeBps: 0,
};

const record = await client.createIntent(intent, "cctp");
console.log(`${stamp()} intent ${record.hash} deposit address ${record.depositAddress}, max fee ${formatUnits(maxFee, 6)} USDC, position receives ${formatUnits(intent.amount, 6)} USDC`);

const burn = await buildSolanaDepositForBurn({ cctp, owner, amount: burnAmount, destinationDomain: hubDomain, mintRecipient: record.depositAddress, maxFee, minFinalityThreshold: 1000 });
console.log(`${stamp()} burn built over ${burn.transaction.length} bytes, message account ${burn.eventAccount}`);

if (simulate) {
  const result = await simulateSolanaDeposit(cctp, burn.transaction);
  for (const line of result.logs) console.log(`  ${line}`);
  console.log(`${stamp()} simulation ${result.ok ? "succeeded" : `failed, ${result.error}`}`);
  process.exit(result.ok ? 0 : 1);
}

const signature = await sendSolanaTransaction(cctp, await signSolanaDeposit(burn.transaction, keypair as Uint8Array));
console.log(`${stamp()} burned ${formatUnits(burnAmount, 6)} USDC on Solana devnet in ${signature}`);
await client.reportSourceTransaction(record.hash, signature as Hex);

let last = "";
let current = record;
const deadline = Date.now() + 20 * 60 * 1000;
while (Date.now() < deadline) {
  current = await client.getIntent(record.hash);
  const line = `${current.state} ${current.arcMintTx ?? ""} ${current.sweepTx ?? ""} ${current.destinationTx ?? ""} ${current.error ?? ""}`.replace(/\s+/g, " ").trim();
  if (line !== last) {
    console.log(`${stamp()} ${line}`);
    last = line;
  }
  if (["executed", "claimable", "refunded", "expired", "failed"].includes(current.state)) break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

console.log(`${stamp()} solana ${signature}, arc mint ${current.arcMintTx ?? "none"}, sweep ${current.sweepTx ?? "none"}, destination ${current.destinationTx ?? "none"}, refund ${current.refundTx ?? "none"}${current.refundMintTx ? `, refund mint ${current.refundMintTx}` : ""}`);

function readKeypair(path?: string, secret?: string) {
  const raw = path ? readFileSync(path, "utf8") : secret;
  return raw ? solanaKeypairBytes(raw) : undefined;
}

function rootEnv(name: string) {
  try {
    const file = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    const line = file.split("\n").find((entry) => entry.trimStart().startsWith(`${name}=`));
    return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") || undefined;
  } catch {
    return undefined;
  }
}
