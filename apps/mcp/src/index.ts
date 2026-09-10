#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  GATEWAY_EXPIRY_BLOCKS,
  GatewayClient,
  InletRelayerClient,
  IrisClient,
  burnIntentTypedData,
  cometAbi,
  cometAuthorizationTypedData,
  createBurnIntent,
  exitableDestinations,
  explorers,
  findDestinationSpec,
  findSourceSpec,
  gatewayMaxFee,
  gatewayWalletAbi,
  hashExit,
  inletExitAbi,
  maxFeeBpsFor,
  parseExit,
  permitAbi,
  permitTypedData,
  serializeBurnIntent,
  serializeExit,
  serializeIntent,
  testnetChains,
  testnetDestinations,
  testnetSources,
  toBytes32,
  tokenMessengerV2Abi,
  type DepositIntent,
  type ExitIntent,
  type ExitRecord,
  type IntentRecord,
  type Route,
} from "@inletkit/sdk";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, formatUnits, http, parseUnits, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, baseSepolia, sepolia, unichainSepolia } from "viem/chains";
import { z } from "zod";

const relayerUrl = process.env.INLET_RELAYER_URL ?? "https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io";
const relayer = new InletRelayerClient(relayerUrl, 20_000);
const iris = new IrisClient(testnetChains.circle.irisApi);
const gateway = new GatewayClient(testnetChains.circle.gatewayApi);
const hubDomain = 26;
const rawKey = process.env.INLET_PRIVATE_KEY?.trim();
const account = rawKey ? privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as Hex) : undefined;
const chains: Record<number, Chain> = { 6: baseSepolia, 3: arbitrumSepolia, 10: unichainSepolia, 0: sepolia };
const rpcs: Record<number, string> = { 6: testnetChains.baseSepolia.rpc, 3: testnetChains.arbitrumSepolia.rpc };
const chainNames: Record<number, string> = { 0: "Ethereum Sepolia", 3: "Arbitrum Sepolia", 6: "Base Sepolia", 10: "Unichain Sepolia", 15: "Monad Testnet", 26: "Arc Testnet" };

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "an EVM address");
const hex = z.string().regex(/^0x[0-9a-fA-F]*$/, "hex bytes");
const usdcAmount = z.string().regex(/^\d+(\.\d{1,6})?$/, "a USDC amount such as 1.5");

const server = new McpServer({ name: "inlet", version: "0.1.0" });

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, bigints, 2) }] };
}

function bigints(_: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function summarize(record: IntentRecord) {
  const destination = testnetDestinations.find((entry) => entry.destinationDomain === record.intent.destinationDomain && entry.adapterId.toLowerCase() === record.intent.adapterId.toLowerCase());
  const link = (domain: number, hash?: Hex) => (hash && hash !== ("external" as string) ? `${explorers[domain] ?? ""}${hash}` : undefined);
  return {
    hash: record.hash,
    state: record.state,
    route: record.route,
    destination: destination?.name ?? `domain ${record.intent.destinationDomain}`,
    amountUsdc: formatUnits(record.intent.amount, 6),
    depositAddress: record.depositAddress,
    sourceTx: link(record.intent.sourceDomain, record.sourceTx),
    arcMintTx: link(hubDomain, record.arcMintTx),
    sweepTx: link(hubDomain, record.sweepTx),
    destinationTx: link(record.intent.destinationDomain, record.destinationTx),
    refundTx: link(hubDomain, record.refundTx),
    result: record.result,
    error: record.error,
    statusPage: `https://inletkit.vercel.app/app?hash=${record.hash}`,
  };
}

server.registerTool(
  "list_destinations",
  { title: "List Inlet destinations", description: "Positions Inlet can deliver on testnet, with their chain, receiver, adapter id and adapter data." },
  async () => text(testnetDestinations),
);

server.registerTool(
  "list_sources",
  { title: "List source chains", description: "Chains a deposit can start from, with USDC, TokenMessengerV2 and GatewayWallet addresses." },
  async () => text({ sources: testnetSources, hub: { chain: "Arc testnet", chainId: testnetChains.arcTestnet.chainId, domain: hubDomain }, relayer: relayerUrl, signer: account?.address }),
);

server.registerTool(
  "quote_deposit",
  {
    title: "Quote a deposit",
    description: "Fee, route and the amount the position will receive for a deposit from a source chain. Gateway needs a unified balance; CCTP needs USDC and gas in the wallet.",
    inputSchema: { sourceDomain: z.number().int(), amountUsdc: usdcAmount, depositor: address.optional(), route: z.enum(["auto", "gateway", "cctp"]).default("auto") },
  },
  async ({ sourceDomain, amountUsdc, depositor, route }) => {
    const source = findSourceSpec(sourceDomain);
    if (!source) return text(`unknown source domain ${sourceDomain}; call list_sources`);
    const sendAmount = parseUnits(amountUsdc, 6);
    const who = (depositor ?? account?.address) as Address | undefined;
    const balances = who ? await gateway.balances(who, [sourceDomain]).catch(() => []) : [];
    const gatewayAvailable = parseUnits(balances[0]?.balance ?? "0", 6);
    const gatewayFee = gatewayMaxFee(sourceDomain, sendAmount);
    const cctpFee = await iris.fastTransferMaxFee(sourceDomain, hubDomain, sendAmount);
    const gatewayPossible = gatewayAvailable >= sendAmount + gatewayFee;
    const chosen: Route = route === "auto" ? (gatewayPossible ? "gateway" : "cctp") : route;
    return text({
      route: chosen,
      sendUsdc: amountUsdc,
      positionReceivesUsdc: formatUnits(chosen === "gateway" ? sendAmount : sendAmount - cctpFee, 6),
      circleFeeAtMostUsdc: formatUnits(chosen === "gateway" ? gatewayFee : cctpFee, 6),
      gatewayBalanceUsdc: formatUnits(gatewayAvailable, 6),
      gatewayPossible,
      expectedSeconds: chosen === "gateway" ? 20 : 40,
    });
  },
);

async function buildIntent(params: { owner: Address; sourceDomain: number; destinationId: string; amountUsdc: string; route: Route; beneficiary?: Address; deadlineMinutes?: number }) {
  const destination = findDestinationSpec(params.destinationId);
  if (!destination) throw new Error(`unknown destination ${params.destinationId}; call list_destinations`);
  const sendAmount = parseUnits(params.amountUsdc, 6);
  const maxFee = params.route === "cctp" ? await iris.fastTransferMaxFee(params.sourceDomain, hubDomain, sendAmount) : 0n;
  const intent: DepositIntent = {
    owner: params.owner,
    sourceDomain: params.sourceDomain,
    destinationDomain: destination.destinationDomain,
    adapterId: destination.adapterId,
    receiver: toBytes32(destination.receiver),
    beneficiary: toBytes32(params.beneficiary ?? params.owner),
    adapterData: destination.adapterData,
    amount: sendAmount - maxFee,
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + (params.deadlineMinutes ?? 120) * 60),
    refundRecipient: toBytes32(params.owner),
    feeBps: 0,
  };
  return { destination, intent, sendAmount, maxFee };
}

server.registerTool(
  "create_intent",
  {
    title: "Create a deposit intent",
    description: "Registers a deposit with the relayer and returns the deposit address on Arc plus exactly what to sign or send next. Nothing moves until the source transaction or the signed Gateway intent is submitted.",
    inputSchema: {
      owner: address,
      sourceDomain: z.number().int(),
      destinationId: z.string(),
      amountUsdc: usdcAmount,
      route: z.enum(["gateway", "cctp"]),
      beneficiary: address.optional(),
      deadlineMinutes: z.number().int().min(5).max(1440).optional(),
    },
  },
  async (params) => {
    const source = findSourceSpec(params.sourceDomain);
    if (!source) return text(`unknown source domain ${params.sourceDomain}; call list_sources`);
    const { intent, sendAmount, maxFee, destination } = await buildIntent({ ...params, owner: params.owner as Address, beneficiary: params.beneficiary as Address | undefined });
    const record = await relayer.createIntent(intent, params.route);
    const next =
      params.route === "cctp"
        ? {
            step1: { chainId: source.chainId, to: source.usdc, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [source.tokenMessenger, sendAmount] }), purpose: "approve TokenMessengerV2 for the send amount" },
            step2: {
              chainId: source.chainId,
              to: source.tokenMessenger,
              data: encodeFunctionData({ abi: tokenMessengerV2Abi, functionName: "depositForBurn", args: [sendAmount, hubDomain, toBytes32(record.depositAddress), source.usdc, toBytes32("0x0000000000000000000000000000000000000000"), maxFee, 1000] }),
              purpose: "burn USDC toward the deposit address on Arc, then call report_source_transaction with the hash",
            },
          }
        : {
            sign: burnIntentTypedData(
              createBurnIntent({
                sourceDomain: source.domain,
                destinationDomain: hubDomain,
                sourceWallet: source.gatewayWallet,
                destinationMinter: testnetChains.arcTestnet.gatewayMinter as Address,
                sourceToken: source.usdc,
                destinationToken: testnetChains.arcTestnet.usdc as Address,
                depositor: params.owner as Address,
                recipient: record.depositAddress,
                value: sendAmount,
                maxBlockHeight: (await createPublicClient({ chain: chains[source.domain], transport: http(source.domain === 6 ? testnetChains.baseSepolia.rpc : undefined) }).getBlockNumber()) + GATEWAY_EXPIRY_BLOCKS,
              }),
            ),
            purpose: "sign this EIP 712 BurnIntent with the owner's wallet and call submit_gateway_intent with the burnIntent and the signature",
          };
    return text({ hash: record.hash, depositAddress: record.depositAddress, destination: destination.name, intent: serializeIntent(intent), next });
  },
);

server.registerTool(
  "report_source_transaction",
  { title: "Report the CCTP burn", description: "Tell the relayer which source chain transaction burned the USDC for a CCTP route intent.", inputSchema: { hash: hex, sourceTx: hex } },
  async ({ hash, sourceTx }) => text(summarize(await relayer.reportSourceTransaction(hash as Hex, sourceTx as Hex))),
);

server.registerTool(
  "submit_gateway_intent",
  {
    title: "Submit a signed Gateway burn intent",
    description: "Hands the signed BurnIntent from create_intent to the relayer, which mints on Arc through Circle Gateway.",
    inputSchema: { hash: hex, burnIntent: z.record(z.string(), z.unknown()), signature: hex },
  },
  async ({ hash, burnIntent, signature }) => {
    const parsed = burnIntent as unknown as ReturnType<typeof createBurnIntent>;
    const spec = parsed.spec as unknown as Record<string, unknown>;
    const normalized = { ...parsed, maxBlockHeight: BigInt(String(parsed.maxBlockHeight)), maxFee: BigInt(String(parsed.maxFee)), spec: { ...parsed.spec, value: BigInt(String(spec.value)) } };
    return text(summarize(await relayer.submitGateway(hash as Hex, { burnIntent: normalized, signature: signature as Hex })));
  },
);

server.registerTool(
  "deposit_status",
  { title: "Deposit status", description: "Current state of a deposit with explorer links for every hop.", inputSchema: { hash: hex } },
  async ({ hash }) => text(summarize(await relayer.getIntent(hash as Hex))),
);

server.registerTool(
  "uniswap_quote",
  {
    title: "Uniswap pool price",
    description: "Live quote from the Uniswap Trading API through the relayer, for example how much ETH an amount of USDC buys on Unichain Sepolia.",
    inputSchema: { amountUsdc: usdcAmount, chainId: z.number().int().default(1301), tokenIn: address.default(testnetChains.unichainSepolia.usdc), tokenOut: address.default("0x0000000000000000000000000000000000000000") },
  },
  async ({ amountUsdc, chainId, tokenIn, tokenOut }) => text(await relayer.uniswapQuote({ chainId, tokenIn: tokenIn as Hex, tokenOut: tokenOut as Hex, amount: parseUnits(amountUsdc, 6) })),
);

if (account) {
  server.registerTool(
    "deposit",
    {
      title: "Deposit with the configured wallet",
      description: "Runs a whole deposit with the wallet in INLET_PRIVATE_KEY: registers the intent, signs the Gateway intent or sends the CCTP burn, then waits for the position. Returns every transaction hash.",
      inputSchema: { sourceDomain: z.number().int(), destinationId: z.string(), amountUsdc: usdcAmount, route: z.enum(["auto", "gateway", "cctp"]).default("auto"), beneficiary: address.optional(), waitSeconds: z.number().int().min(0).max(600).default(120) },
    },
    async ({ sourceDomain, destinationId, amountUsdc, route, beneficiary, waitSeconds }) => {
      const source = findSourceSpec(sourceDomain);
      if (!source) return text(`unknown source domain ${sourceDomain}; call list_sources`);
      const chain = chains[sourceDomain];
      const transport = http();
      const publicClient = createPublicClient({ chain, transport });
      const walletClient = createWalletClient({ account, chain, transport });
      const sendAmount = parseUnits(amountUsdc, 6);
      let chosen: Route = route === "cctp" || route === "gateway" ? route : "cctp";
      if (route === "auto") {
        const balances = await gateway.balances(account.address, [sourceDomain]).catch(() => []);
        const available = parseUnits(balances[0]?.balance ?? "0", 6);
        chosen = available >= sendAmount + gatewayMaxFee(sourceDomain, sendAmount) ? "gateway" : "cctp";
      }
      const { intent } = await buildIntent({ owner: account.address, sourceDomain, destinationId, amountUsdc, route: chosen, beneficiary: beneficiary as Address | undefined });
      const record = await relayer.createIntent(intent, chosen);
      const steps: Record<string, string> = { hash: record.hash, depositAddress: record.depositAddress, route: chosen };

      if (chosen === "gateway") {
        const block = await publicClient.getBlockNumber();
        const burnIntent = createBurnIntent({
          sourceDomain,
          destinationDomain: hubDomain,
          sourceWallet: source.gatewayWallet,
          destinationMinter: testnetChains.arcTestnet.gatewayMinter as Address,
          sourceToken: source.usdc,
          destinationToken: testnetChains.arcTestnet.usdc as Address,
          depositor: account.address,
          recipient: record.depositAddress,
          value: sendAmount,
          maxBlockHeight: block + GATEWAY_EXPIRY_BLOCKS,
        });
        const signature = await walletClient.signTypedData(burnIntentTypedData(burnIntent));
        await relayer.submitGateway(record.hash, { burnIntent, signature });
        steps.gatewayBurnIntent = JSON.stringify(serializeBurnIntent(burnIntent));
      } else {
        const allowance = await publicClient.readContract({ address: source.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, source.tokenMessenger] });
        if (allowance < sendAmount) {
          const approve = await walletClient.writeContract({ address: source.usdc, abi: erc20Abi, functionName: "approve", args: [source.tokenMessenger, sendAmount] });
          await publicClient.waitForTransactionReceipt({ hash: approve });
          steps.approveTx = `${source.explorer}${approve}`;
          for (let attempt = 0; attempt < 30; attempt++) {
            const visible = await publicClient.readContract({ address: source.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, source.tokenMessenger] });
            if (visible >= sendAmount) break;
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
        const maxFee = sendAmount - intent.amount;
        const burn = await walletClient.writeContract({
          address: source.tokenMessenger,
          abi: tokenMessengerV2Abi,
          functionName: "depositForBurn",
          args: [sendAmount, hubDomain, toBytes32(record.depositAddress), source.usdc, toBytes32("0x0000000000000000000000000000000000000000"), maxFee, 1000],
          gas: 350_000n,
        });
        await publicClient.waitForTransactionReceipt({ hash: burn });
        await relayer.reportSourceTransaction(record.hash, burn);
        steps.burnTx = `${source.explorer}${burn}`;
      }

      const until = Date.now() + waitSeconds * 1000;
      let latest = await relayer.getIntent(record.hash);
      while (Date.now() < until && !["executed", "claimable", "refunded", "expired", "failed"].includes(latest.state)) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        latest = await relayer.getIntent(record.hash);
      }
      return text({ ...steps, ...summarize(latest) });
    },
  );

  server.registerTool(
    "fund_gateway_balance",
    {
      title: "Add USDC to the Gateway balance",
      description: "Deposits USDC from the configured wallet into Circle's GatewayWallet on a source chain. The balance becomes spendable after the chain reaches finality, about twenty minutes on Base Sepolia.",
      inputSchema: { sourceDomain: z.number().int(), amountUsdc: usdcAmount },
    },
    async ({ sourceDomain, amountUsdc }) => {
      const source = findSourceSpec(sourceDomain);
      if (!source) return text(`unknown source domain ${sourceDomain}; call list_sources`);
      const chain = chains[sourceDomain];
      const publicClient = createPublicClient({ chain, transport: http() });
      const walletClient = createWalletClient({ account, chain, transport: http() });
      const amount = parseUnits(amountUsdc, 6);
      const approve = await walletClient.writeContract({ address: source.usdc, abi: erc20Abi, functionName: "approve", args: [source.gatewayWallet, amount] });
      await publicClient.waitForTransactionReceipt({ hash: approve });
      for (let attempt = 0; attempt < 30; attempt++) {
        const visible = await publicClient.readContract({ address: source.usdc, abi: erc20Abi, functionName: "allowance", args: [account.address, source.gatewayWallet] });
        if (visible >= amount) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const deposit = await walletClient.writeContract({ address: source.gatewayWallet, abi: gatewayWalletAbi, functionName: "deposit", args: [source.usdc, amount], gas: 250_000n });
      await publicClient.waitForTransactionReceipt({ hash: deposit });
      return text({ approveTx: `${source.explorer}${approve}`, depositTx: `${source.explorer}${deposit}`, note: "spendable once Circle sees finality on the source chain" });
    },
  );
}

function summarizeExit(record: ExitRecord) {
  const spec = exitableDestinations.find((entry) => entry.exit.adapterId.toLowerCase() === record.intent.adapterId.toLowerCase() && entry.exit.adapterData.toLowerCase() === record.intent.adapterData.toLowerCase());
  const link = (domain: number, hash?: Hex) => (hash && hash !== ("external" as string) ? `${explorers[domain] ?? ""}${hash}` : undefined);
  return {
    hash: record.hash,
    state: record.state,
    position: spec?.name ?? `domain ${record.domain}`,
    positionChain: chainNames[record.domain] ?? `domain ${record.domain}`,
    executor: record.executor,
    exitTx: link(record.domain, record.exitTx),
    receivedUsdc: record.received === undefined ? undefined : formatUnits(record.received, 6),
    legs: record.legs.map((leg, index) => ({
      chain: chainNames[leg.domain] ?? `domain ${leg.domain}`,
      amountUsdc: index + 1 === record.legs.length ? "the rest" : formatUnits(leg.amount, 6),
      attested: leg.attested,
      mintTx: link(leg.domain, leg.mintTx),
    })),
    error: record.error,
    statusPage: `https://inletkit.vercel.app/app?hash=${record.hash}`,
  };
}

const legInput = z.array(z.object({ domain: z.number().int(), amountUsdc: usdcAmount.optional() })).min(1).max(4);

/// The executor address is what the owner's signature names as spender, so it has to exist before anyone signs.
async function buildExit(params: { owner: Address; destinationId: string; amountUsdc: string; legs: { domain: number; amountUsdc?: string }[]; recipient?: Address; deadlineMinutes?: number }) {
  const spec = exitableDestinations.find((entry) => entry.id === params.destinationId);
  if (!spec) throw new Error(`${params.destinationId} cannot be withdrawn through Inlet; call list_withdrawable`);
  const exit = spec.exit;
  const domain = spec.destinationDomain;
  const chain = chains[domain];
  const client = createPublicClient({ chain, transport: http(rpcs[domain]) });
  const token = { address: exit.positionToken } as const;

  const amount = parseUnits(params.amountUsdc, 6);
  const shares = exit.adapterName === "erc4626-exit:v1";
  const units = shares ? await client.readContract({ ...token, abi: permitAbi, functionName: "previewWithdraw", args: [amount] }) : amount;
  const minAssets = (shares ? await client.readContract({ ...token, abi: permitAbi, functionName: "previewRedeem", args: [units] }) : amount) - 2n;

  const recipient = toBytes32(params.recipient ?? params.owner);
  const legs = params.legs.map((leg, index) => {
    const last = index + 1 === params.legs.length;
    if (leg.domain === domain) throw new Error(`a leg cannot land on ${chainNames[domain]}, the chain the position is on`);
    if (!last && !leg.amountUsdc) throw new Error(`leg ${index} needs amountUsdc; only the last leg takes the rest`);
    return { domain: leg.domain, recipient, amount: last ? 0n : parseUnits(leg.amountUsdc!, 6) };
  });
  let maxFeeBps = 0;
  for (const leg of legs) maxFeeBps = Math.max(maxFeeBps, maxFeeBpsFor(await iris.getBurnFees(domain, leg.domain)));

  const deadline = BigInt(Math.floor(Date.now() / 1000) + (params.deadlineMinutes ?? 120) * 60);
  const intent: ExitIntent = { owner: params.owner, adapterId: exit.adapterId, adapterData: exit.adapterData, amount: units, minAssets, legs, nonce: BigInt(Date.now()), deadline, maxFeeBps };
  const hash = hashExit(intent, exit.exitContract, chain.id);
  const executor = await client.readContract({ address: exit.exitContract, abi: inletExitAbi, functionName: "exitAddress", args: [hash] });

  const sign =
    exit.permit === "comet"
      ? cometAuthorizationTypedData({
          name: await client.readContract({ ...token, abi: cometAbi, functionName: "name" }),
          version: await client.readContract({ ...token, abi: cometAbi, functionName: "version" }),
          chainId: chain.id,
          verifyingContract: exit.positionToken,
          owner: params.owner,
          manager: executor,
          nonce: await client.readContract({ ...token, abi: cometAbi, functionName: "userNonce", args: [params.owner] }),
          expiry: deadline,
        })
      : permitTypedData({
          name: await client.readContract({ ...token, abi: permitAbi, functionName: "name" }),
          chainId: chain.id,
          verifyingContract: exit.positionToken,
          owner: params.owner,
          spender: executor,
          value: units,
          nonce: await client.readContract({ ...token, abi: permitAbi, functionName: "nonces", args: [params.owner] }),
          deadline,
        });
  return { spec, chain, intent, hash, executor, sign, units, minAssets };
}

server.registerTool(
  "list_withdrawable",
  {
    title: "List withdrawable positions",
    description: "Positions the exit rail can turn back into USDC on other chains, with the InletExit and the kind of signature each needs. With an owner address, also what that wallet holds in each.",
    inputSchema: { owner: address.optional() },
  },
  async ({ owner }) => {
    const rows = await Promise.all(
      exitableDestinations.map(async (spec) => {
        const exit = spec.exit;
        const client = createPublicClient({ chain: chains[spec.destinationDomain], transport: http(rpcs[spec.destinationDomain]) });
        const balance = owner ? await client.readContract({ address: exit.positionToken, abi: permitAbi, functionName: "balanceOf", args: [owner as Address] }).catch(() => undefined) : undefined;
        return {
          id: spec.id,
          name: spec.name,
          chain: spec.chain,
          positionToken: exit.positionToken,
          positionLabel: spec.positionLabel,
          signature: exit.permit === "comet" ? "Compound allowBySig authorization" : "EIP 2612 permit",
          inletExit: exit.exitContract,
          balance: balance === undefined ? undefined : formatUnits(balance, exit.positionDecimals),
        };
      }),
    );
    return text({ positions: rows, legChains: Object.entries(chainNames).map(([domain, name]) => ({ domain: Number(domain), name })), note: "a leg can land on any listed chain except the one the position is on; the last leg takes whatever is left" });
  },
);

server.registerTool(
  "create_exit",
  {
    title: "Create a withdrawal",
    description: "Builds the exit intent for a position, derives the executor address, and returns exactly what the owner signs: an EIP 2612 permit or a Compound authorization naming that executor. Nothing moves until submit_exit receives the signature.",
    inputSchema: { owner: address, destinationId: z.string(), amountUsdc: usdcAmount, legs: legInput, recipient: address.optional(), deadlineMinutes: z.number().int().min(5).max(1440).optional() },
  },
  async (params) => {
    const built = await buildExit({ ...params, owner: params.owner as Address, recipient: params.recipient as Address | undefined });
    return text({
      hash: built.hash,
      executor: built.executor,
      position: built.spec.name,
      redeems: `${formatUnits(built.units, built.spec.exit.positionDecimals)} ${built.spec.positionLabel} for at least ${formatUnits(built.minAssets, 6)} USDC`,
      intent: serializeExit(built.intent),
      sign: built.sign,
      purpose: `sign this typed data with the owner's wallet on ${built.spec.chain}, no gas, then call submit_exit with the intent and the signature`,
    });
  },
);

server.registerTool(
  "submit_exit",
  { title: "Submit a signed withdrawal", description: "Hands the exit intent from create_exit and the owner's signature to the relayer, which redeems the position and lands the USDC on every leg.", inputSchema: { intent: z.record(z.string(), z.unknown()), signature: hex } },
  async ({ intent, signature }) => text(summarizeExit(await relayer.createExit(parseExit(intent), signature as Hex))),
);

server.registerTool(
  "exit_status",
  { title: "Withdrawal status", description: "Current state of a withdrawal with the redemption transaction and the mint transaction of every leg.", inputSchema: { hash: hex } },
  async ({ hash }) => text(summarizeExit(await relayer.getExit(hash as Hex))),
);

if (account) {
  server.registerTool(
    "withdraw",
    {
      title: "Withdraw with the configured wallet",
      description: "Runs a whole withdrawal with the wallet in INLET_PRIVATE_KEY: builds the exit, signs the permit for the derived executor, submits it, and waits for the USDC to land on every leg. Returns every transaction hash.",
      inputSchema: { destinationId: z.string(), amountUsdc: usdcAmount, legs: legInput, waitSeconds: z.number().int().min(0).max(600).default(180) },
    },
    async ({ destinationId, amountUsdc, legs, waitSeconds }) => {
      const built = await buildExit({ owner: account.address, destinationId, amountUsdc, legs });
      const signature =
        built.spec.exit.permit === "comet"
          ? await account.signTypedData(built.sign as ReturnType<typeof cometAuthorizationTypedData>)
          : await account.signTypedData(built.sign as ReturnType<typeof permitTypedData>);
      const record = await relayer.createExit(built.intent, signature);
      const until = Date.now() + waitSeconds * 1000;
      let latest = record;
      while (Date.now() < until && latest.state !== "delivered") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        latest = await relayer.getExit(record.hash);
      }
      return text(summarizeExit(latest));
    },
  );
}

const transport = new StdioServerTransport();
await server.connect(transport);
