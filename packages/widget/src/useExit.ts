import {
  InletRelayerClient,
  IrisClient,
  cometAbi,
  cometAuthorizationTypedData,
  inletExitAbi,
  maxFeeBpsFor,
  permitAbi,
  permitTypedData,
  toBytes32,
  type ExitIntent,
} from "@inletkit/sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseUnits, type Hex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract, signTypedData, switchChain } from "wagmi/actions";
import { chainNameForDomain, exitKind, exitable, irisApi } from "./config.js";
import { errorMessage, usdc } from "./format.js";
import type { Destination, ExitLegInput, ExitPosition, ExitQuote, ExitQuoteLeg, ExitWidgetState } from "./types.js";
import { useRelayerHealth } from "./useRelayerHealth.js";

// The executor pulls the position and the vault rounds against it, so ask for a hair less back.
const dust = 2n;

function under(value: bigint): bigint {
  return value > dust ? value - dust : 0n;
}

export function useExit(params: { relayerUrl: string; destinations: Destination[]; destination?: Destination }) {
  const { relayerUrl, destinations, destination } = params;
  const config = useConfig();
  const { address, chainId } = useAccount();
  const [state, setState] = useState<ExitWidgetState>({ phase: "idle" });
  const [positions, setPositions] = useState<ExitPosition[]>([]);
  const poller = useRef<ReturnType<typeof setInterval>>(undefined);

  const relayer = useMemo(() => new InletRelayerClient(relayerUrl), [relayerUrl]);
  const iris = useMemo(() => new IrisClient(irisApi), []);
  const { status } = useRelayerHealth(relayerUrl);
  const withExit = useMemo(() => exitable(destinations), [destinations]);

  useEffect(() => () => clearInterval(poller.current), []);

  /// Every exitable position lives on a chain the provider's wagmi config covers, so the reads
  /// name their chain and the wallet can stay wherever it is.
  const refresh = useCallback(async () => {
    if (!address || withExit.length === 0) {
      setPositions([]);
      return;
    }
    const next = await Promise.all(
      withExit.map(async (entry) => {
        const exit = entry.exit!;
        const token = { chainId: entry.chainId, address: exit.positionToken, abi: permitAbi } as const;
        const balance = await readContract(config, { ...token, functionName: "balanceOf", args: [address] }).catch(() => 0n);
        const assets =
          balance > 0n && exitKind(exit) === "vault"
            ? await readContract(config, { ...token, functionName: "convertToAssets", args: [balance] }).catch(() => balance)
            : balance;
        return { destination: entry, balance, assets };
      }),
    );
    setPositions(next);
  }, [address, config, withExit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const quote = useCallback(
    async (amountInput: string, legs: ExitLegInput[]): Promise<ExitQuote | undefined> => {
      if (!address || !destination?.exit || legs.length === 0) return undefined;
      const exit = destination.exit;
      let amount: bigint;
      try {
        amount = parseUnits(amountInput || "0", 6);
      } catch {
        return undefined;
      }
      if (amount <= 0n) return undefined;
      setState((previous) => ({ ...previous, phase: "quoting", error: undefined }));
      try {
        const kind = exitKind(exit);
        const token = { chainId: destination.chainId, address: exit.positionToken, abi: permitAbi } as const;
        const balance = await readContract(config, { ...token, functionName: "balanceOf", args: [address] });
        const [position, assets] =
          kind === "vault"
            ? await Promise.all([
                readContract(config, { ...token, functionName: "previewWithdraw", args: [amount] }),
                readContract(config, { ...token, functionName: "convertToAssets", args: [balance] }),
              ])
            : [amount, balance];
        const minAssets = kind === "vault" ? under(await readContract(config, { ...token, functionName: "previewRedeem", args: [position] })) : under(amount);

        const perLeg = await Promise.all(legs.map((leg) => iris.getBurnFees(destination.destinationDomain, leg.domain).then(maxFeeBpsFor).catch(() => 1)));
        const maxFeeBps = Math.max(...perLeg);
        const fixed = legs.slice(0, -1).reduce((total, leg) => total + (leg.amount ?? 0n), 0n);
        const rows: ExitQuoteLeg[] = legs.map((leg, index) => {
          const last = index === legs.length - 1;
          const value = last ? (amount > fixed ? amount - fixed : 0n) : (leg.amount ?? 0n);
          const fee = (value * BigInt(maxFeeBps)) / 10_000n;
          return { domain: leg.domain, amount: value, fee, lands: value > fee ? value - fee : 0n, last };
        });

        const chain = chainNameForDomain(destination.destinationDomain);
        const blocker =
          balance === 0n
            ? `This wallet holds no ${exit.positionLabel} on ${chain}.`
            : position > balance
              ? `That is more than the position holds. The most you can withdraw is ${usdc(assets)}.`
              : legs.slice(0, -1).some((leg) => !leg.amount)
                ? "Every chain but the last one needs an amount."
                : fixed >= amount
                  ? `The fixed legs take the whole amount, so nothing is left for ${chainNameForDomain(rows[rows.length - 1].domain)}.`
                  : status !== "online"
                    ? "The relayer is not answering, so the withdrawal cannot be submitted yet."
                    : undefined;

        const next: ExitQuote = { destination, amount, position, minAssets, maxFeeBps, legs: rows, balance, assets, ready: !blocker, blocker };
        setState((previous) => ({ ...previous, phase: "ready", quote: next }));
        return next;
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
        return undefined;
      }
    },
    [address, config, destination, iris, status],
  );

  const track = useCallback(
    (hash: Hex) => {
      clearInterval(poller.current);
      poller.current = setInterval(async () => {
        try {
          const record = await relayer.getExit(hash);
          const done = record.state === "delivered";
          setState((previous) => ({ ...previous, phase: done ? "done" : "tracking", record }));
          if (!done) return;
          clearInterval(poller.current);
          void refresh();
        } catch (error) {
          setState((previous) => ({ ...previous, error: errorMessage(error) }));
        }
      }, 2000);
    },
    [relayer, refresh],
  );

  const exit = useCallback(
    async (current: ExitQuote) => {
      const target = current.destination;
      const spec = target.exit;
      if (!address || !spec || !current.ready) return;
      try {
        setState({ phase: "signing", quote: current });
        const recipient = toBytes32(address);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 24 * 3600);
        const intent: ExitIntent = {
          owner: address,
          adapterId: spec.adapterId,
          adapterData: spec.adapterData,
          amount: current.position,
          minAssets: current.minAssets,
          legs: current.legs.map((leg) => ({ domain: leg.domain, recipient, amount: leg.last ? 0n : leg.amount })),
          nonce: BigInt(Date.now()),
          deadline,
          maxFeeBps: current.maxFeeBps,
        };

        // The executor address is what the signature names as spender, and it is a view call away.
        const contract = { chainId: target.chainId, address: spec.exitContract, abi: inletExitAbi } as const;
        const exitHash = await readContract(config, { ...contract, functionName: "hashExit", args: [intent] });
        const executor = await readContract(config, { ...contract, functionName: "exitAddress", args: [exitHash] });

        const token = { chainId: target.chainId, address: spec.positionToken } as const;
        let sign: () => Promise<Hex>;
        if (spec.permit === "comet") {
          const [nonce, name, version] = await Promise.all([
            readContract(config, { ...token, abi: cometAbi, functionName: "userNonce", args: [address] }),
            readContract(config, { ...token, abi: cometAbi, functionName: "name" }),
            readContract(config, { ...token, abi: cometAbi, functionName: "version" }),
          ]);
          const typed = cometAuthorizationTypedData({ name, version, chainId: target.chainId, verifyingContract: spec.positionToken, owner: address, manager: executor, nonce, expiry: deadline });
          sign = () => signTypedData(config, { account: address, ...typed });
        } else {
          const [nonce, name] = await Promise.all([
            readContract(config, { ...token, abi: permitAbi, functionName: "nonces", args: [address] }),
            readContract(config, { ...token, abi: permitAbi, functionName: "name" }),
          ]);
          const typed = permitTypedData({ name, chainId: target.chainId, verifyingContract: spec.positionToken, owner: address, spender: executor, value: current.position, nonce, deadline });
          sign = () => signTypedData(config, { account: address, ...typed });
        }

        // No gas is spent on the position chain. An injected wallet only accepts typed data whose
        // domain matches the chain it is on, so move it there before asking for the signature.
        if (chainId !== target.chainId) await switchChain(config, { chainId: target.chainId });
        const signature = await sign();

        setState({ phase: "sending", quote: current });
        const record = await relayer.createExit(intent, signature);
        setState({ phase: "tracking", quote: current, record });
        track(record.hash);
      } catch (error) {
        setState((previous) => ({ ...previous, phase: "error", error: errorMessage(error) }));
      }
    },
    [address, chainId, config, relayer, track],
  );

  const reset = useCallback(() => {
    clearInterval(poller.current);
    setState({ phase: "idle" });
  }, []);

  return { state, positions, quote, exit, reset, refresh, address, relayerStatus: status };
}
