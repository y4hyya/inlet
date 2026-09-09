import { InletRelayerClient, type IntentRecord, type UniswapQuote } from "@inletkit/sdk";
import { useEffect, useRef, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { defaultSources } from "../config.js";
import { useInlet } from "../context.js";
import { short, usdc } from "../format.js";
import { isSignedIn } from "../session.js";
import type { Destination, RoutePreference, SourceChain } from "../types.js";
import { useDeposit } from "../useDeposit.js";
import { StatusTimeline } from "./StatusTimeline.js";

export interface DepositWidgetProps {
  destinations: Destination[];
  relayerUrl?: string;
  sources?: SourceChain[];
  defaultAmount?: string;
  defaultDestinationId?: string;
  title?: string;
  onRecord?: (record: IntentRecord) => void;
}

export function DepositWidget({
  destinations,
  relayerUrl,
  sources = defaultSources,
  defaultAmount = "1",
  defaultDestinationId,
  title = "Deposit from any chain",
  onRecord,
}: DepositWidgetProps) {
  const inlet = useInlet();
  const url = relayerUrl ?? inlet.relayerUrl;
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const signedIn = isSignedIn({ address, authenticated: inlet.authenticated, isConnected });

  const [destinationId, setDestinationId] = useState(destinations.find((entry) => entry.id === defaultDestinationId)?.id ?? destinations[0]?.id);
  const [sourceDomain, setSourceDomain] = useState(sources[0]?.domain);
  const [amount, setAmount] = useState(defaultAmount);
  const [preference, setPreference] = useState<RoutePreference>("auto");

  const [relayerStatus, setRelayerStatus] = useState<"checking" | "online" | "offline">("checking");
  useEffect(() => {
    let stopped = false;
    const client = new InletRelayerClient(url, 8000);
    const check = () =>
      client
        .health()
        .then((health) => !stopped && setRelayerStatus(health.ok ? "online" : "offline"))
        .catch(() => !stopped && setRelayerStatus("offline"));
    void check();
    const handle = setInterval(check, 15_000);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [url]);

  const destination = destinations.find((entry) => entry.id === destinationId) ?? destinations[0];
  const source = sources.find((entry) => entry.domain === sourceDomain) ?? sources[0];
  const { state, quote, deposit, fundGateway, reset } = useDeposit({ relayerUrl: url, source, sources, destination });
  const [gatewayTx, setGatewayTx] = useState<string>();
  const [moved, setMoved] = useState<SourceChain | undefined>();
  const chainName = (domain: number) => sources.find((entry) => entry.domain === domain)?.name ?? `domain ${domain}`;

  useEffect(() => {
    const connected = sources.find((entry) => entry.chainId === chainId);
    if (connected) setSourceDomain(connected.domain);
  }, [chainId, sources]);

  const phase = useRef(state.phase);
  phase.current = state.phase;

  useEffect(() => {
    if (state.record) onRecord?.(state.record);
  }, [state.record, onRecord]);

  // The quote, the record, the notices and any error belong to the session that asked for them.
  useEffect(() => {
    if (signedIn) return;
    reset();
    setGatewayTx(undefined);
    setMoved(undefined);
  }, [signedIn, reset]);

  useEffect(() => {
    if (!signedIn || !address) return;
    const handle = setTimeout(() => {
      if (["creating", "signing", "sending", "tracking", "done"].includes(phase.current)) return;
      void quote(amount, preference).then((next) => {
        if (!next || next.sourceDomain === source.domain) return;
        const target = sources.find((entry) => entry.domain === next.sourceDomain);
        if (!target) return;
        setMoved(target);
        setSourceDomain(target.domain);
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [amount, preference, signedIn, address, source, sources, destination, quote]);

  const [price, setPrice] = useState<{ quote: UniswapQuote; amount: string } | undefined>();
  useEffect(() => {
    const hint = destination?.price;
    setPrice(undefined);
    if (!hint || relayerStatus !== "online") return;
    let amountIn: bigint;
    try {
      amountIn = parseUnits(amount || "0", 6);
    } catch {
      return;
    }
    if (amountIn <= 0n) return;
    let stopped = false;
    const client = new InletRelayerClient(url, 20_000);
    const handle = setTimeout(() => {
      client
        .uniswapQuote({ chainId: hint.chainId, tokenIn: hint.tokenIn, tokenOut: hint.tokenOut, amount: amountIn })
        .then((quote) => !stopped && setPrice({ quote, amount }))
        .catch(() => !stopped && setPrice(undefined));
    }, 500);
    return () => {
      stopped = true;
      clearTimeout(handle);
    };
  }, [destination, amount, url, relayerStatus]);

  const busy = ["creating", "signing", "sending"].includes(state.phase);
  const quoting = state.phase === "quoting";
  const tracking = state.phase === "tracking" || state.phase === "done";
  const signOutLabel = inlet.logout ? "Log out" : "Disconnect";
  const signOut = async () => {
    if (!inlet.logout) return disconnect();
    try {
      await inlet.logout();
    } catch (error) {
      console.error("Inlet could not end the session", error);
    }
  };

  return (
    <section className="inlet">
      <header className="inlet-header">
        <h2 className="inlet-title">
          {title}
          <span className={`inlet-relayer inlet-relayer-${relayerStatus}`} title={url}>
            {relayerStatus === "online" ? "relayer online" : relayerStatus === "offline" ? `relayer unreachable at ${url}` : "checking relayer"}
          </span>
        </h2>
        {signedIn && address ? (
          <button className="inlet-account" type="button" onClick={signOut} title={`${signOutLabel}, ${address}`} aria-label={`${signOutLabel} ${short(address)}`}>
            <span className="inlet-account-name">{short(address)}</span>
            <svg className="inlet-account-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M9.5 13.5H4.5A1.5 1.5 0 0 1 3 12V4a1.5 1.5 0 0 1 1.5-1.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7.5 8H14m-2.5-2.5L14 8l-2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
      </header>

      {tracking && state.record ? (
        <div className="inlet-body">
          <StatusTimeline record={state.record} destination={destination} sourceExplorer={source.explorer} />
          {state.phase === "done" ? (
            <button className="inlet-secondary" type="button" onClick={reset}>
              New deposit
            </button>
          ) : null}
        </div>
      ) : (
        <div className="inlet-body">
          <label className="inlet-field">
            <span>Into</span>
            <select id="inlet-destination" name="destination" value={destination?.id} onChange={(event) => setDestinationId(event.target.value)} disabled={busy}>
              {destinations.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inlet-field">
            <span>From</span>
            <select id="inlet-source" name="source" value={source?.domain} onChange={(event) => setSourceDomain(Number(event.target.value))} disabled={busy}>
              {sources.map((entry) => (
                <option key={entry.domain} value={entry.domain}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="inlet-field">
            <span>Amount</span>
            <input id="inlet-amount" name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} />
          </label>
          <div className="inlet-routes">
            {(["auto", "gateway", "cctp"] as RoutePreference[]).map((option) => (
              <button key={option} type="button" className={`inlet-chip ${preference === option ? "inlet-chip-on" : ""}`} onClick={() => setPreference(option)} disabled={busy}>
                {option === "auto" ? "Best route" : option === "gateway" ? "Gateway" : "CCTP"}
              </button>
            ))}
          </div>

          {signedIn && state.quote ? (
            <dl className={`inlet-quote ${quoting ? "inlet-quote-stale" : ""}`}>
              <div>
                <dt>Route</dt>
                <dd>{state.quote.route === "gateway" ? `Gateway from your ${chainName(state.quote.sourceDomain)} balance, one signature, no gas, no network switch` : `CCTP fast transfer from ${chainName(state.quote.sourceDomain)}, approve and burn`}</dd>
              </div>
              <div>
                <dt>You send</dt>
                <dd>{usdc(state.quote.sendAmount)}</dd>
              </div>
              <div>
                <dt>Position receives</dt>
                <dd>{usdc(state.quote.intentAmount)}</dd>
              </div>
              <div>
                <dt>Circle fee, at most</dt>
                <dd>{usdc(state.quote.circleFee)}</dd>
              </div>
              <div>
                <dt>Wallet USDC</dt>
                <dd>{usdc(state.quote.walletUsdc)}</dd>
              </div>
              <div>
                <dt>Gateway balances</dt>
                <dd>{sources.map((entry) => `${entry.name} ${usdc(state.quote!.gatewayBalances[entry.domain] ?? 0n)}`).join(", ")}</dd>
              </div>
              {destination?.price && price ? (
                <div>
                  <dt>Pool price now</dt>
                  <dd>
                    {price.amount} USDC buys {Number(formatUnits(BigInt(price.quote.amountOut), destination.price.tokenOutDecimals)).toPrecision(5)} {destination.price.tokenOutSymbol} via{" "}
                    {price.quote.route.map((hop) => hop.type).join(", ") || "the pool"}, from the {destination.price.venue}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {moved && preference === "auto" && state.quote?.sourceDomain === moved.domain ? <p className="inlet-note">Switched From to {moved.name}, where your Gateway balance is. Your wallet stays on its current network.</p> : null}
          {state.quote?.blocker ? <p className="inlet-warn">{state.quote.blocker}</p> : null}
          {state.quote?.gatewayElsewhere !== undefined ? (
            <p className="inlet-warn">
              Your Gateway balance is on {chainName(state.quote.gatewayElsewhere)}.{" "}
              <button className="inlet-link" type="button" onClick={() => setSourceDomain(state.quote!.gatewayElsewhere!)}>
                Use {chainName(state.quote.gatewayElsewhere)}
              </button>
            </p>
          ) : null}
          {gatewayTx ? (
            <p className="inlet-warn">
              Deposited into your Gateway balance in{" "}
              <a className="inlet-step-link" href={source.explorer + gatewayTx} target="_blank" rel="noreferrer">
                {short(gatewayTx)}
              </a>
              . Circle credits it once {source.name} reaches finality, usually fifteen to twenty minutes.
            </p>
          ) : null}
          {state.error ? <p className="inlet-warn">{state.error}</p> : null}

          {!signedIn ? (
            <button
              className="inlet-primary"
              type="button"
              disabled={!inlet.ready}
              onClick={() => (inlet.login ? inlet.login() : connectors[0] ? connect({ connector: connectors[0] }) : undefined)}
            >
              {inlet.login ? "Log in to deposit" : "Connect a wallet to deposit"}
            </button>
          ) : (
            <>
              <button
                className="inlet-primary"
                type="button"
                disabled={!state.quote || !state.quote.ready || busy || quoting || relayerStatus !== "online"}
                onClick={() => state.quote && void deposit(state.quote)}
              >
                {state.phase === "creating" ? "Registering intent" : state.phase === "signing" ? "Waiting for your wallet" : state.phase === "sending" ? "Sending" : quoting ? "Quoting" : "Deposit"}
              </button>
              <button
                className="inlet-secondary"
                type="button"
                disabled={busy || state.phase === "quoting"}
                onClick={() => void fundGateway(amount).then((tx) => tx && setGatewayTx(tx))}
              >
                Add {amount || "0"} USDC to my Gateway balance on {source.name}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
