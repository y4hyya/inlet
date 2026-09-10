import {
  GATEWAY_EXPIRY_BLOCKS,
  GatewayClient,
  InletRelayerClient,
  IrisClient,
  burnIntentTypedData,
  createBurnIntent,
  gatewayWalletAbi,
  toBytes32,
  tokenMessengerV2Abi,
  type DepositIntent,
  type IntentRecord,
} from "@inletkit/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { erc20Abi, parseUnits, type Address, type Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getBalance, getBlockNumber, readContract, signTypedData, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { arcGatewayMinter, arcUsdc, gatewayApi, hubDomain, irisApi } from "./config.js";
import { errorMessage } from "./format.js";
import { planRoute } from "./route.js";
import type { DepositState, Destination, Quote, RoutePreference, SourceChain } from "./types.js";

const terminal = new Set(["executed", "claimable", "refunded", "expired", "failed"]);

export function useDeposit(params: { relayerUrl: string; source: SourceChain; sources: SourceChain[]; destination: Destination }) {
  const { relayerUrl, source, sources, destination } = params;
  const config = useConfig();
  const { address, chainId } = useAccount();
  const [state, setState] = useState<DepositState>({ phase: "idle" });
  const poller = useRef<ReturnType<typeof setInterval>>(undefined);

  const relayer = useMemo(() => new InletRelayerClient(relayerUrl), [relayerUrl]);
  const iris = useMemo(() => new IrisClient(irisApi), []);
  const gateway = useMemo(() => new GatewayClient(gatewayApi), []);

  useEffect(() => () => clearInterval(poller.current), []);

  const chainFor = useCallback((domain: number) => sources.find((entry) => entry.domain === domain) ?? source, [sources, source]);

  const quote = useCallback(
    async (amountInput: string, preference: RoutePreference): Promise<Quote | undefined> => {
      if (!address) return undefined;
      let sendAmount: bigint;
      try {
        sendAmount = parseUnits(amountInput || "0", 6);
      } catch {
        return undefined;
      }
      if (sendAmount <= 0n) return undefined;
      setState((previous) => ({ ...previous, phase: "quoting", error: undefined }));
      try {
        const balances = await gateway.balances(address, sources.map((entry) => entry.domain)).catch(() => []);
        const gatewayBalances: Record<number, bigint> = {};
        for (const entry of sources) gatewayBalances[entry.domain] = 0n;
        for (const entry of balances) gatewayBalances[entry.domain] = parseUnits(entry.balance ?? "0", 6);

        const plan = planRoute({ preference, source, sources, sendAmount, gatewayBalances });
        const chosen = chainFor(plan.sourceDomain);
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
    [address, config, source, sources, chainFor, gateway, iris],
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
    async (target: SourceChain) => {
      if (chainId !== target.chainId) await switchChain(config, { chainId: target.chainId });
    },
    [config, chainId],
  );

  const waitForAllowance = useCallback(
    async (target: SourceChain, owner: Address, spender: Address, amount: bigint) => {
      for (let attempt = 0; attempt < 30; attempt++) {
        const visible = await readContract(config, { chainId: target.chainId, address: target.usdc, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
        if (visible >= amount) return;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    },
    [config],
  );

  const approveIfNeeded = useCallback(
    async (target: SourceChain, owner: Address, spender: Address, amount: bigint) => {
      const allowance = await readContract(config, { chainId: target.chainId, address: target.usdc, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
      if (allowance >= amount) return;
      const approve = await writeContract(config, { chainId: target.chainId, account: owner, address: target.usdc, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
      await waitForTransactionReceipt(config, { chainId: target.chainId, hash: approve });
      await waitForAllowance(target, owner, spender, amount);
    },
    [config, waitForAllowance],
  );

  const deposit = useCallback(
    async (current: Quote) => {
      if (!address || !current.ready) return;
      const target = chainFor(current.sourceDomain);
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
    [address, config, destination, relayer, chainFor, ensureChain, approveIfNeeded, track],
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

  return { state, quote, deposit, fundGateway, reset, address, chainId, connectedToSource: chainId === source.chainId };
}
