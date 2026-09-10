import cors from "@fastify/cors";
import { exitableDestinations, hashExit, hashIntent, inletExitAbi, inletHubAbi, parseBurnIntent, parseExit, parseIntent, serializeExitRecord, serializeIntent, toBytes32, type Route } from "@inletkit/sdk";
import Fastify from "fastify";
import { isAddress, zeroAddress, type Address, type Hex } from "viem";
import type { ChainContext } from "./chains.js";
import type { RelayerConfig } from "./config.js";
import type { ExitStore, IntentStore, StoredExit, StoredIntent } from "./db.js";
import { UniswapQuoter } from "./uniswap.js";

export async function buildApp(config: RelayerConfig, chains: Record<number, ChainContext>, store: IntentStore, exits: ExitStore) {
  const app = Fastify({ logger: false });
  const origins = (process.env.CORS_ORIGIN ?? "*").split(",").map((entry) => entry.trim());
  await app.register(cors, { origin: origins.includes("*") ? true : origins });
  const arc = chains[config.hubDomain];

  const relayerAddress = arc.walletClient.account?.address as Address;
  const quoter = config.uniswapApiKey ? new UniswapQuoter(config.uniswapApiKey, relayerAddress) : undefined;

  app.get("/health", async () => ({ ok: true, hub: config.hub, relayer: relayerAddress, destinations: Object.keys(config.receivers).map(Number), exits: Object.keys(config.exits).map(Number), uniswapQuotes: Boolean(quoter) }));

  app.get<{ Querystring: { chainId: string; tokenIn: Address; tokenOut: Address; amount: string } }>("/quotes/uniswap", async (request, reply) => {
    if (!quoter) return reply.code(404).send({ error: "Uniswap quotes are not configured on this relayer" });
    const { chainId, tokenIn, tokenOut, amount } = request.query;
    if (!chainId || !isAddress(tokenIn) || !isAddress(tokenOut) || !/^\d+$/.test(amount ?? "")) return reply.code(400).send({ error: "chainId, tokenIn, tokenOut and amount are required" });
    try {
      return await quoter.quote(Number(chainId), tokenIn, tokenOut, BigInt(amount));
    } catch (error) {
      return reply.code(502).send({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post<{ Body: { intent: Record<string, unknown>; route: Route } }>("/intents", async (request, reply) => {
    const intent = parseIntent(request.body.intent);
    const route = request.body.route;
    if (route !== "cctp" && route !== "gateway") return reply.code(400).send({ error: "route must be cctp or gateway" });
    if (intent.feeBps !== 0) return reply.code(400).send({ error: "feeBps must be 0" });
    if (intent.amount <= 0n) return reply.code(400).send({ error: "amount must be positive" });
    if (intent.deadline <= BigInt(Math.floor(Date.now() / 1000))) return reply.code(400).send({ error: "deadline is in the past" });
    const receiver = config.receivers[intent.destinationDomain];
    if (!receiver) return reply.code(400).send({ error: `unsupported destination domain ${intent.destinationDomain}` });
    if (intent.receiver.toLowerCase() !== toBytes32(receiver).toLowerCase()) return reply.code(400).send({ error: "receiver does not match the registered receiver" });

    const hash = hashIntent(intent, config.hub, arc.chain.id);
    const existing = store.get(hash);
    if (existing) return present(existing);

    const depositAddress = await arc.publicClient.readContract({ address: config.hub, abi: inletHubAbi, functionName: "depositAddress", args: [hash] });
    const block = Number(await arc.publicClient.getBlockNumber());
    return present(store.insert(hash, intent, route, depositAddress, block));
  });

  app.post<{ Params: { hash: Hex }; Body: { sourceTx: Hex } }>("/intents/:hash/source-tx", async (request, reply) => {
    const record = store.get(request.params.hash);
    if (!record) return reply.code(404).send({ error: "unknown intent" });
    return present(store.update(record.hash, { source_tx: request.body.sourceTx }));
  });

  app.post<{ Params: { hash: Hex }; Body: { burnIntent: Record<string, unknown>; signature: Hex } }>("/intents/:hash/gateway", async (request, reply) => {
    const record = store.get(request.params.hash);
    if (!record) return reply.code(404).send({ error: "unknown intent" });
    if (record.route !== "gateway") return reply.code(400).send({ error: "intent is not on the gateway route" });
    const burnIntent = parseBurnIntent(request.body.burnIntent);
    const spec = burnIntent.spec;
    if (spec.destinationDomain !== config.hubDomain) return reply.code(400).send({ error: "destination domain must be Arc" });
    if (spec.sourceDomain !== record.intent.sourceDomain) return reply.code(400).send({ error: "source domain does not match the intent" });
    if (spec.destinationRecipient.toLowerCase() !== toBytes32(record.depositAddress).toLowerCase()) return reply.code(400).send({ error: "recipient must be the deposit address" });
    if (spec.destinationContract.toLowerCase() !== toBytes32(arc.gatewayMinter).toLowerCase()) return reply.code(400).send({ error: "destination contract must be the Arc Gateway minter" });
    if (spec.value < record.intent.amount) return reply.code(400).send({ error: "value is below the intent amount" });
    return present(store.setGatewayRequest(record.hash, { burnIntent, signature: request.body.signature }));
  });

  app.get<{ Params: { hash: Hex } }>("/intents/:hash", async (request, reply) => {
    const record = store.get(request.params.hash);
    if (!record) return reply.code(404).send({ error: "unknown intent" });
    return present(record);
  });

  app.post<{ Body: { intent: Record<string, unknown>; signature: Hex } }>("/exits", async (request, reply) => {
    let intent;
    try {
      intent = parseExit(request.body?.intent ?? {});
    } catch {
      return reply.code(400).send({ error: "intent is missing fields" });
    }
    const signature = request.body?.signature;
    if (!signature || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return reply.code(400).send({ error: "signature must be 65 bytes" });
    if (intent.deadline <= BigInt(Math.floor(Date.now() / 1000))) return reply.code(400).send({ error: "deadline is in the past" });
    if (intent.legs.length === 0) return reply.code(400).send({ error: "at least one leg is required" });

    const spec = exitableDestinations.find((entry) => entry.exit.adapterId.toLowerCase() === intent.adapterId.toLowerCase() && entry.exit.adapterData.toLowerCase() === intent.adapterData.toLowerCase());
    if (!spec) return reply.code(400).send({ error: "no exit rail for this adapter and position" });
    const position = chains[spec.destinationDomain];
    const exit = config.exits[spec.destinationDomain];
    if (!position || !exit) return reply.code(400).send({ error: `no InletExit on ${spec.chain}` });

    for (const [index, leg] of intent.legs.entries()) {
      if (!chains[leg.domain]) return reply.code(400).send({ error: `unsupported leg domain ${leg.domain}` });
      if (index + 1 < intent.legs.length && leg.amount <= 0n) return reply.code(400).send({ error: `leg ${index} amount must be positive` });
    }

    const adapter = await position.publicClient.readContract({ address: exit, abi: inletExitAbi, functionName: "adapters", args: [intent.adapterId] });
    if (adapter === zeroAddress) return reply.code(400).send({ error: `the adapter is not registered on the InletExit at ${exit}` });

    const hash = hashExit(intent, exit, position.chain.id);
    const existing = exits.get(hash);
    if (existing) return presentExit(existing);

    const executor = await position.publicClient.readContract({ address: exit, abi: inletExitAbi, functionName: "exitAddress", args: [hash] });
    return presentExit(exits.insert(hash, intent, signature, spec.destinationDomain, executor));
  });

  app.get<{ Params: { hash: Hex } }>("/exits/:hash", async (request, reply) => {
    const record = exits.get(request.params.hash);
    if (!record) return reply.code(404).send({ error: "unknown exit" });
    return presentExit(record);
  });

  return app;
}

function presentExit(record: StoredExit) {
  return serializeExitRecord(record);
}

function present(record: StoredIntent) {
  const { message: _message, attestation: _attestation, gatewayRequest: _request, gatewayAttestation: _gatewayAttestation, ...rest } = record;
  return { ...rest, intent: serializeIntent(record.intent) };
}
