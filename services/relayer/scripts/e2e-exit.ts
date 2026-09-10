import { InletRelayerClient, IrisClient, cometAbi, cometAuthorizationTypedData, exitableDestinations, hashExit, inletExitAbi, maxFeeBpsFor, permitAbi, permitTypedData, toBytes32, type ExitIntent, type ExitLeg } from "@inletkit/sdk";
import { createPublicClient, formatUnits, http, parseUnits, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, baseSepolia } from "viem/chains";
import { loadConfig } from "../src/config.js";
import { createRelayer } from "../src/relayer.js";

const aliases: Record<string, string> = {
  aave: "aave-v3-arbitrum-sepolia",
  morpho: "morpho-oneshot-base-sepolia",
  compound: "compound-v3-base-sepolia",
};

const positionChains: Record<number, Chain> = { 3: arbitrumSepolia, 6: baseSepolia };

const key = process.env.DESTINATION ?? "aave";
const spec = exitableDestinations.find((entry) => entry.id === (aliases[key] ?? key));
if (!spec) throw new Error(`DESTINATION must be one of ${Object.keys(aliases).join(", ")} and its InletExit must be in config/deployments.testnet.json`);

const exit = spec.exit;
const shares = exit.adapterName === "erc4626-exit:v1";
const config = loadConfig({ ...process.env, DB_PATH: `data/e2e-exit-${Date.now()}.db`, PORT: "0" });
const rawKey = (process.env.USER_PRIVATE_KEY ?? config.privateKey).trim();
const user = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex);
const domain = spec.destinationDomain;
const chain = positionChains[domain];
const publicClient = createPublicClient({ chain, transport: http(config.rpc[domain]) });
const iris = new IrisClient(config.irisApi);

const amount = parseUnits(process.env.AMOUNT ?? "1", 6);
const legs = parseLegs(process.env.LEGS ?? "0", user.address);

const remote = process.env.RELAYER_URL;
const relayer = remote ? { url: remote, stop: async () => {} } : await createRelayer(config).start();
const client = new InletRelayerClient(relayer.url);
console.log(`relayer ${relayer.url}${remote ? " (remote)" : ""}, user ${user.address}, withdrawing ${formatUnits(amount, 6)} USDC from ${spec.name}`);
const started = Date.now();
const stamp = () => `${Math.round((Date.now() - started) / 1000)}s`;

try {
  const position = await readPosition();
  const units = shares ? await publicClient.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "previewWithdraw", args: [amount] }) : amount;
  if (position.balance < units) throw new Error(`the position holds ${formatUnits(position.balance, exit.positionDecimals)} and this exit needs ${formatUnits(units, exit.positionDecimals)}`);
  const minAssets = shares ? (await publicClient.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "previewRedeem", args: [units] })) - 2n : amount - 2n;

  let maxFeeBps = 0;
  for (const leg of legs) maxFeeBps = Math.max(maxFeeBps, maxFeeBpsFor(await iris.getBurnFees(domain, leg.domain)));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 2 * 3600);
  const intent: ExitIntent = {
    owner: user.address,
    adapterId: exit.adapterId,
    adapterData: exit.adapterData,
    amount: units,
    minAssets,
    legs,
    nonce: BigInt(Date.now()),
    deadline,
    maxFeeBps,
  };

  const hash = await publicClient.readContract({ address: exit.exitContract, abi: inletExitAbi, functionName: "hashExit", args: [intent] });
  if (hash !== hashExit(intent, exit.exitContract, chain.id)) throw new Error("the SDK and the InletExit disagree on the exit hash");
  const executor = await publicClient.readContract({ address: exit.exitContract, abi: inletExitAbi, functionName: "exitAddress", args: [hash] });
  console.log(`${stamp()} exit ${hash} executor ${executor}, ${formatUnits(units, exit.positionDecimals)} ${spec.positionLabel} for at least ${formatUnits(minAssets, 6)} USDC, max fee ${maxFeeBps} bps, ${describe(legs)}`);

  const signature = exit.permit === "comet"
    ? await user.signTypedData(cometAuthorizationTypedData({ name: position.name, version: position.version, chainId: chain.id, verifyingContract: exit.positionToken, owner: user.address, manager: executor, nonce: position.nonce, expiry: deadline }))
    : await user.signTypedData(permitTypedData({ name: position.name, version: position.version, chainId: chain.id, verifyingContract: exit.positionToken, owner: user.address, spender: executor, value: units, nonce: position.nonce, deadline }));

  await client.createExit(intent, signature);

  let last = "";
  const timeout = Date.now() + 20 * 60 * 1000;
  while (Date.now() < timeout) {
    const current = await client.getExit(hash);
    const line = `${current.state} ${current.exitTx ?? ""} ${current.received === undefined ? "" : `${formatUnits(current.received, 6)} USDC`} ${current.legs.map((leg) => `${leg.domain}:${leg.mintTx ?? (leg.attested ? "attested" : "waiting")}`).join(" ")} ${current.error ?? ""}`.replace(/\s+/g, " ").trim();
    if (line !== last) {
      console.log(`${stamp()} ${line}`);
      last = line;
    }
    if (current.state === "delivered") break;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  const after = await readPosition();
  console.log(`${stamp()} ${spec.positionLabel} before ${position.balance} after ${after.balance}`);
} finally {
  await relayer.stop();
}

function parseLegs(raw: string, recipient: Address): ExitLeg[] {
  const entries = raw.split(",").map((entry) => entry.trim()).filter(Boolean);
  if (entries.length === 0) throw new Error("LEGS must name at least one domain, like 6:0.5,0");
  return entries.map((entry, index) => {
    const [leg, value] = entry.split(":");
    const last = index + 1 === entries.length;
    if (!last && !value) throw new Error(`the leg ${entry} needs an amount, only the last leg takes the rest`);
    return { domain: Number(leg), recipient: toBytes32(recipient), amount: last ? 0n : parseUnits(value ?? "0", 6) };
  });
}

function describe(entries: ExitLeg[]) {
  return entries.map((leg, index) => (index + 1 === entries.length ? `the rest to domain ${leg.domain}` : `${formatUnits(leg.amount, 6)} USDC to domain ${leg.domain}`)).join(", ");
}

async function readPosition() {
  if (exit.permit === "comet") {
    const [balance, nonce, name, version] = await Promise.all([
      publicClient.readContract({ address: exit.positionToken, abi: cometAbi, functionName: "balanceOf", args: [user.address] }),
      publicClient.readContract({ address: exit.positionToken, abi: cometAbi, functionName: "userNonce", args: [user.address] }),
      publicClient.readContract({ address: exit.positionToken, abi: cometAbi, functionName: "name" }),
      publicClient.readContract({ address: exit.positionToken, abi: cometAbi, functionName: "version" }),
    ]);
    return { balance, nonce, name, version };
  }
  const [balance, nonce, name] = await Promise.all([
    publicClient.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "balanceOf", args: [user.address] }),
    publicClient.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "nonces", args: [user.address] }),
    publicClient.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "name" }),
  ]);
  return { balance, nonce, name, version: "1" };
}
