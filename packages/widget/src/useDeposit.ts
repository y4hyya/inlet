import {
  GATEWAY_EXPIRY_BLOCKS,
  GatewayClient,
  InletRelayerClient,
  IrisClient,
  buildSolanaDepositForBurn,
  burnIntentTypedData,
  bytes32FromSolanaAddress,
  createBurnIntent,
  gatewayWalletAbi,
  hasGateway,
  solanaSignatureToBase58,
  solanaUsdcAccount,
  solanaUsdcBalance,
  toBytes32,
  tokenMessengerV2Abi,
  type DepositIntent,
  type EvmSource,
  type IntentRecord,
  type SolanaSource,
} from "@inletkit/sdk";
import { address as solanaAddress, createSolanaRpc } from "@solana/kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getBalance, getBlockNumber, readContract, signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { arcGatewayMinter, arcUsdc, gatewayApi, hubDomain, irisApi } from "./config.js";
import { errorMessage } from "./format.js";
import { planRoute } from "./route.js";
import type { DepositState, Destination, Quote, RoutePreference, SourceChain } from "./types.js";

const terminal = new Set(["executed", "claimable", "refunded", "expired", "failed"]);

/// The Solana wallet the host connected, and the one call the deposit needs from it.
export interface SolanaWallet {
  address: string;
  signAndSend: (transaction: Uint8Array) => Promise<Uint8Array>;
}

function solanaCctp(source: SolanaSource) {
  return { rpc: source.rpc, usdcMint: source.usdc, tokenMessengerMinter: source.tokenMessenger, messageTransmitter: source.messageTransmitter };
}

export function useDeposit(params: { relayerUrl: string; source: SourceChain; sources: SourceChain[]; destination: Destination; solana?: SolanaWallet }) {
  const { relayerUrl, source, sources, destination, solana } = params;
  const config = useConfig();
  const { address, chainId } = useAccount();
  const [state, setState] = useState<DepositState>({ phase: "idle" });
  const poller = useRef<ReturnType<typeof setInterval>>(undefined);

  const relayer = useMemo(() => new InletRelayerClient(relayerUrl), [relayerUrl]);
  const iris = useMemo(() => new IrisClient(irisApi), []);
  const gateway = useMemo(() => new GatewayClient(gatewayApi), []);

  useEffect(() => () => clearInterval(poller.current), []);

  const chainFor = useCallback((domain: number) => sources.find((entry) => entry.domain === domain) ?? source, [sources, source]);

  /// Solana has no Gateway and no second chain to move to, so the quote is a plain CCTP burn.
  const solanaQuote = useCallback(
    async (target: SolanaSource, sendAmount: bigint): Promise<Quote | undefined> => {
      if (!solana) {
        const waiting: Quote = {
          route: "cctp",
          sourceDomain: target.domain,
          sendAmount,
          intentAmount: sendAmount,
          circleFee: 0n,
          walletUsdc: 0n,
          gatewayAvailable: 0n,
          gatewayBalances: {},
          needsGas: false,
          ready: false,
          blocker: "Connect a Solana wallet",
        };
        setState((previous) => ({ ...previous, phase: "ready", quote: waiting }));
        return waiting;
      }
      setState((previous) => ({ ...previous, phase: "quoting", error: undefined }));
      try {
        const [walletUsdc, sol, maxFee] = await Promise.all([
          solanaUsdcBalance(solanaCctp(target), solana.address),
          createSolanaRpc(target.rpc).getBalance(solanaAddress(solana.address)).send(),
          iris.fastTransferMaxFee(target.domain, hubDomain, sendAmount),
        ]);
        const needsGas = sol.value === 0n;
        const enough = walletUsdc >= sendAmount;
        const next: Quote = {
          route: "cctp",
          sourceDomain: target.domain,
          sendAmount,
          intentAmount: sendAmount - maxFee,
          circleFee: maxFee,
          walletUsdc,
          gatewayAvailable: 0n,
          gatewayBalances: {},
          needsGas,
          ready: enough && !needsGas && Boolean(address),
          blocker: !enough
            ? `Not enough USDC in the wallet on ${target.name}.`
            : needsGas
              ? `This route needs a little SOL on ${target.name} to pay for the transaction.`
              : !address
                ? "Log in so the position has an EVM address"
                : undefined,
        };
        setState((previous) => ({ ...previous, phase: "ready", quote: next }));
        return next;
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
        return undefined;
      }
    },
    [address, solana, iris],
  );

  const quote = useCallback(
    async (amountInput: string, preference: RoutePreference): Promise<Quote | undefined> => {
      let sendAmount: bigint;
      try {
        sendAmount = parseUnits(amountInput || "0", 6);
      } catch {
        return undefined;
      }
      if (sendAmount <= 0n) return undefined;
      if (source.kind === "solana") return solanaQuote(source, sendAmount);
      if (!address) return undefined;
      setState((previous) => ({ ...previous, phase: "quoting", error: undefined }));
      try {
        const gatewayChains = sources.filter(hasGateway);
        const balances = gatewayChains.length ? await gateway.balances(address, gatewayChains.map((entry) => entry.domain)).catch(() => []) : [];
        const gatewayBalances: Record<number, bigint> = {};
        for (const entry of gatewayChains) gatewayBalances[entry.domain] = 0n;
        for (const entry of balances) gatewayBalances[entry.domain] = parseUnits(entry.balance ?? "0", 6);

        const plan = planRoute({ preference, source, sources, sendAmount, gatewayBalances });
        const chosen = chainFor(plan.sourceDomain);
        if (chosen.kind !== "evm") throw new Error(`${chosen.name} is not a deposit source yet.`);
        const [walletUsdc, eth] = await Promise.all([
          readContract(config, { chainId: chosen.chainId, address: chosen.usdc, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
          getBalance(config, { chainId: chosen.chainId, address }),
        ]);
        const gatewayAvailable = gatewayBalances[chosen.domain] ?? 0n;

        let next: Quote;
        if (plan.route === "gateway") {
          const ready = gatewayAvailable >= sendAmount + plan.gatewayFee;
          next = {
            route: "gateway",
            sourceDomain: chosen.domain,
            sendAmount,
            intentAmount: sendAmount,
            circleFee: plan.gatewayFee,
            walletUsdc,
            gatewayAvailable,
            gatewayBalances,
            gatewayElsewhere: plan.gatewayElsewhere,
            needsGas: false,
            ready,
            blocker: ready ? undefined : `Your Gateway balance on ${chosen.name} does not cover the amount plus fee.`,
          };
        } else {
          const maxFee = await iris.fastTransferMaxFee(chosen.domain, hubDomain, sendAmount);
          const needsGas = eth.value === 0n;
          const enough = walletUsdc >= sendAmount;
          next = {
            route: "cctp",
            sourceDomain: chosen.domain,
            sendAmount,
            intentAmount: sendAmount - maxFee,
            circleFee: maxFee,
            walletUsdc,
            gatewayAvailable,
            gatewayBalances,
            needsGas,
            ready: enough && !needsGas,
            blocker: !enough ? `Not enough USDC in the wallet on ${chosen.name}.` : needsGas ? `This route needs a little ETH on ${chosen.name} for two transactions. Use Gateway to skip gas entirely.` : undefined,
          };
        }
        setState((previous) => ({ ...previous, phase: "ready", quote: next }));
        return next;
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
        return undefined;
      }
    },
    [address, config, source, sources, chainFor, gateway, iris, solanaQuote],
  );

  const track = useCallback(
    (hash: Hex) => {
      clearInterval(poller.current);
      poller.current = setInterval(async () => {
        try {
          const record = await relayer.getIntent(hash);
          setState((previous) => ({ ...previous, phase: terminal.has(record.state) ? "done" : "tracking", record }));
          if (terminal.has(record.state)) clearInterval(poller.current);
        } catch (error) {
          setState((previous) => ({ ...previous, error: errorMessage(error) }));
        }
      }, 2000);
    },
    [relayer],
  );

  const ensureChain = useCallback(
    async (target: EvmSource) => {
      if (chainId !== target.chainId) await switchChain(config, { chainId: target.chainId });
    },
    [config, chainId],
  );

  const waitForAllowance = useCallback(
    async (target: EvmSource, owner: Address, spender: Address, amount: bigint) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const visible = await readContract(config, { chainId: target.chainId, address: target.usdc, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
        if (visible >= amount) return;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    },
    [config],
  );

  const approveIfNeeded = useCallback(
    async (target: EvmSource, owner: Address, spender: Address, amount: bigint) => {
      const allowance = await readContract(config, { chainId: target.chainId, address: target.usdc, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
      if (allowance >= amount) return;
      const approve = await writeContract(config, { chainId: target.chainId, account: owner, address: target.usdc, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
      await waitForTransactionReceipt(config, { chainId: target.chainId, hash: approve });
      await waitForAllowance(target, owner, spender, amount);
    },
    [config, waitForAllowance],
  );

  /// The position lives on an EVM chain, so the owner and the beneficiary stay the EVM address
  /// and only the refund comes back to the USDC account that paid.
  const depositFromSolana = useCallback(
    async (current: Quote, target: SolanaSource) => {
      if (!address || !solana) return;
      try {
        setState({ phase: "creating", quote: current });
        const cctp = solanaCctp(target);
        const intent: DepositIntent = {
          owner: address,
          sourceDomain: target.domain,
          destinationDomain: destination.destinationDomain,
          adapterId: destination.adapterId,
          receiver: toBytes32(destination.receiver),
          beneficiary: toBytes32(address),
          adapterData: destination.adapterData({ beneficiary: address, amount: current.intentAmount }),
          amount: current.intentAmount,
          nonce: BigInt(Date.now()),
          deadline: BigInt(Math.floor(Date.now() / 1000) + 2 * 3600),
          refundRecipient: bytes32FromSolanaAddress(await solanaUsdcAccount(solana.address, cctp.usdcMint)),
          feeBps: 0,
        };
        const record: IntentRecord = await relayer.createIntent(intent, "cctp");
        setState({ phase: "signing", quote: current, record });
        const { transaction } = await buildSolanaDepositForBurn({
          cctp,
          owner: solana.address,
          amount: current.sendAmount,
          destinationDomain: hubDomain,
          mintRecipient: record.depositAddress,
          maxFee: current.circleFee,
          minFinalityThreshold: 1000,
        });
        setState({ phase: "sending", quote: current, record });
        const sourceTx = solanaSignatureToBase58(await solana.signAndSend(transaction));
        await relayer.reportSourceTransaction(record.hash, sourceTx);
        setState({ phase: "tracking", quote: current, record, sourceTx });
        track(record.hash);
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
      }
    },
    [address, destination, relayer, solana, track],
  );

  const deposit = useCallback(
    async (current: Quote) => {
      if (!address || !current.ready) return;
      const target = chainFor(current.sourceDomain);
      if (target.kind === "solana") return depositFromSolana(current, target);
      try {
        setState({ phase: "creating", quote: current });
        const intent: DepositIntent = {
          owner: address,
          sourceDomain: target.domain,
          destinationDomain: destination.destinationDomain,
          adapterId: destination.adapterId,
          receiver: toBytes32(destination.receiver),
          beneficiary: toBytes32(address),
          adapterData: destination.adapterData({ beneficiary: address, amount: current.intentAmount }),
          amount: current.intentAmount,
          nonce: BigInt(Date.now()),
          deadline: BigInt(Math.floor(Date.now() / 1000) + 2 * 3600),
          refundRecipient: toBytes32(address),
          feeBps: 0,
        };
        const record: IntentRecord = await relayer.createIntent(intent, current.route);
        setState({ phase: "signing", quote: current, record });

        if (current.route === "gateway") {
          const block = await getBlockNumber(config, { chainId: target.chainId });
          const burnIntent = createBurnIntent({
            sourceDomain: target.domain,
            destinationDomain: hubDomain,
            sourceWallet: target.gatewayWallet,
            destinationMinter: arcGatewayMinter,
            sourceToken: target.usdc,
            destinationToken: arcUsdc,
            depositor: address,
            recipient: record.depositAddress,
            value: current.sendAmount,
            maxFee: current.circleFee,
            maxBlockHeight: block + GATEWAY_EXPIRY_BLOCKS,
          });
          const signature = await signTypedData(config, { account: address, ...burnIntentTypedData(burnIntent) });
          setState({ phase: "sending", quote: current, record });
          await relayer.submitGateway(record.hash, { burnIntent, signature });
        } else {
          await ensureChain(target);
          await approveIfNeeded(target, address, target.tokenMessenger, current.sendAmount);
          setState({ phase: "sending", quote: current, record });
          const burn = await writeContract(config, {
            chainId: target.chainId,
            account: address,
            address: target.tokenMessenger,
            abi: tokenMessengerV2Abi,
            functionName: "depositForBurn",
            args: [current.sendAmount, hubDomain, toBytes32(record.depositAddress), target.usdc, toBytes32("0x0000000000000000000000000000000000000000"), current.circleFee, 1000],
            gas: 350_000n,
          });
          await waitForTransactionReceipt(config, { chainId: target.chainId, hash: burn });
          await relayer.reportSourceTransaction(record.hash, burn);
          setState({ phase: "tracking", quote: current, record, sourceTx: burn });
        }

        setState((previous) => ({ ...previous, phase: "tracking" }));
        track(record.hash);
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
      }
    },
    [address, config, destination, relayer, chainFor, ensureChain, approveIfNeeded, track, depositFromSolana],
  );

  const fundGateway = useCallback(
    async (amountInput: string): Promise<Hex | undefined> => {
      if (!address) return undefined;
      let amount: bigint;
      try {
        amount = parseUnits(amountInput || "0", 6);
      } catch {
        return undefined;
      }
      if (amount <= 0n) return undefined;
      try {
        if (source.kind !== "evm" || !hasGateway(source)) throw new Error(`There is no Circle Gateway on ${source.name}.`);
        setState((previous) => ({ ...previous, phase: "signing", error: undefined }));
        await ensureChain(source);
        await approveIfNeeded(source, address, source.gatewayWallet, amount);
        setState((previous) => ({ ...previous, phase: "sending" }));
        const deposit = await writeContract(config, { chainId: source.chainId, account: address, address: source.gatewayWallet, abi: gatewayWalletAbi, functionName: "deposit", args: [source.usdc, amount], gas: 250_000n });
        await waitForTransactionReceipt(config, { chainId: source.chainId, hash: deposit });
        setState((previous) => ({ ...previous, phase: "ready", sourceTx: deposit }));
        return deposit;
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
        return undefined;
      }
    },
    [address, config, source, ensureChain, approveIfNeeded],
  );

  const reset = useCallback(() => {
    clearInterval(poller.current);
    setState({ phase: "idle" });
  }, []);

  return { state, quote, deposit, fundGateway, reset, address, chainId, connectedToSource: source.kind === "evm" && chainId === source.chainId };
}
