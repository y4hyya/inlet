import { InletRelayerClient, IrisClient, findDestinationSpec, stellarAccountToBytes32, testnetDeployments, toBytes32, tokenMessengerV2Abi, type DepositIntent } from "@inletkit/sdk";
import { Account, BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative } from "@stellar/stellar-sdk";
import { createPublicClient, createWalletClient, erc20Abi, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config.js";
import { createRelayer } from "../src/relayer.js";
import { pickSource } from "./destinations.js";

const burnAmount = BigInt(process.env.E2E_AMOUNT ?? "1000000");
const config = loadConfig({ ...process.env, DB_PATH: `data/e2e-stellar-${Date.now()}.db`, PORT: "0" });
if (!config.stellar) throw new Error("STELLAR_SECRET_KEY is not set, so this relayer has no Stellar leg");
const userKey = process.env.USER_PRIVATE_KEY;
if (!userKey) throw new Error("USER_PRIVATE_KEY is not set");
const user = privateKeyToAccount((userKey.startsWith("0x") ? userKey : `0x${userKey}`) as Hex);
const trader = process.env.STELLAR_BENEFICIARY ?? Keypair.fromSecret(config.stellar.secret).publicKey();
const destination = findDestinationSpec("noether-cross-margin-stellar-testnet")!;
const source = pickSource();

const publicClient = createPublicClient({ chain: source.chain, transport: http(config.rpc[source.domain] ?? source.rpc) });
const walletClient = createWalletClient({ account: user, chain: source.chain, transport: http(config.rpc[source.domain] ?? source.rpc) });
const iris = new IrisClient(config.irisApi);
const stellar = new rpc.Server(config.stellar.rpc);

async function read(contract: string, method: string, args: ReturnType<typeof nativeToScVal>[] = []) {
  const call = new Contract(contract).call(method, ...args);
  const transaction = new TransactionBuilder(new Account(trader, "0"), { fee: BASE_FEE, networkPassphrase: config.stellar!.passphrase }).addOperation(call).setTimeout(30).build();
  const simulation = await stellar.simulateTransaction(transaction);
  if (rpc.Api.isSimulationError(simulation) || !simulation.result) throw new Error(`${method} could not be read on ${contract}`);
  return scValToNative(simulation.result.retval);
}

// The receiver says which market it deposits into. The mock reads a balance with cross_margin_balance, Noether with get_cross_margin_balance.
const market: string = process.env.STELLAR_MARKET ?? (await read(config.stellar.receiver, "config")).market;
const balanceOf = process.env.STELLAR_BALANCE_FN ?? (market === testnetDeployments.stellarTestnet.mockMarket ? "cross_margin_balance" : "get_cross_margin_balance");

async function margin(): Promise<bigint> {
  return BigInt(await read(market, balanceOf, [nativeToScVal(trader, { type: "address" })]));
}

const remote = process.env.RELAYER_URL;
const relayer = remote ? { url: remote, stop: async () => {} } : await createRelayer(config).start();
const client = new InletRelayerClient(relayer.url);
console.log(`market ${market} read with ${balanceOf}`);
console.log(`relayer ${relayer.url}${remote ? " (remote)" : ""} on hub ${config.hub}, user ${user.address}, ${source.chain.name} into ${destination.name} for ${trader}`);
const started = Date.now();
const stamp = () => `${Math.round((Date.now() - started) / 1000)}s`;

try {
  const before = await margin();
  const maxFee = await iris.fastTransferMaxFee(source.domain, config.hubDomain, burnAmount);
  const intent: DepositIntent = {
    owner: user.address,
    sourceDomain: source.domain,
    destinationDomain: destination.destinationDomain,
    adapterId: destination.adapterId,
    receiver: toBytes32(destination.receiver),
    beneficiary: stellarAccountToBytes32(trader),
    adapterData: destination.adapterData,
    amount: burnAmount - maxFee,
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    refundRecipient: toBytes32(user.address),
    feeBps: 0,
  };
  const record = await client.createIntent(intent, "cctp");
  console.log(`${stamp()} intent ${record.hash}, deposit address ${record.depositAddress}`);

  const approve = await walletClient.writeContract({ address: source.usdc, abi: erc20Abi, functionName: "approve", args: [source.tokenMessengerV2, burnAmount] });
  await publicClient.waitForTransactionReceipt({ hash: approve });
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const visible = await publicClient.readContract({ address: source.usdc, abi: erc20Abi, functionName: "allowance", args: [user.address, source.tokenMessengerV2] });
    if (visible >= burnAmount) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const burn = await walletClient.writeContract({
    address: source.tokenMessengerV2,
    abi: tokenMessengerV2Abi,
    functionName: "depositForBurn",
    args: [burnAmount, config.hubDomain, toBytes32(record.depositAddress), source.usdc, toBytes32("0x0000000000000000000000000000000000000000"), maxFee, 1000],
  });
  await publicClient.waitForTransactionReceipt({ hash: burn });
  const burned = Date.now();
  console.log(`${stamp()} burned on ${source.chain.name} ${burn}`);
  await client.reportSourceTransaction(record.hash, burn);

  let last = "";
  const deadline = Date.now() + 15 * 60 * 1000;
  while (Date.now() < deadline) {
    const current = await client.getIntent(record.hash);
    const line = `${current.state} ${current.arcMintTx ?? ""} ${current.sweepTx ?? ""} ${current.destinationTx ?? ""} ${current.error ?? ""}`.trim();
    if (line !== last) console.log(`${stamp()} ${line}`);
    last = line;
    if (["executed", "claimable", "refunded", "expired", "failed"].includes(current.state)) {
      console.log(`${Math.round((Date.now() - burned) / 1000)}s from the burn to ${current.state}`);
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.log(`${stamp()} ${destination.positionLabel} before ${before} after ${await margin()}`);
} finally {
  await relayer.stop();
}
