import type { ExitRecord } from "@inletkit/sdk";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { useAccount, useConnect } from "wagmi";
import { chainNameForDomain, defaultSources, exitable, explorers } from "../config.js";
import { useInlet } from "../context.js";
import { parseUsdc, tokens, usdc } from "../format.js";
import { isSignedIn } from "../session.js";
import type { Destination } from "../types.js";
import { useExit } from "../useExit.js";
import { useRelayerHealth } from "../useRelayerHealth.js";
import { AccountPill } from "./AccountPill.js";
import { ExitTimeline } from "./ExitTimeline.js";

const maxLegs = 4;

export interface ExitWidgetProps {
  destinations: Destination[];
  relayerUrl?: string;
  defaultDestinationId?: string;
  title?: string;
  // A replacement header, or false for none. The combined widget passes its own.
  header?: ReactNode;
  onExit?: (record: ExitRecord) => void;
}

export function ExitWidget({ destinations, relayerUrl, defaultDestinationId, title = "Withdraw to any chain", header, onExit }: ExitWidgetProps) {
  const inlet = useInlet();
  const url = relayerUrl ?? inlet.relayerUrl;
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const signedIn = isSignedIn({ address, authenticated: inlet.authenticated, isConnected });
  const { status: relayerStatus, health } = useRelayerHealth(url);

  const withExit = useMemo(() => exitable(destinations), [destinations]);
  const [destinationId, setDestinationId] = useState(withExit.find((entry) => entry.id === defaultDestinationId)?.id ?? withExit[0]?.id);
  const destination = withExit.find((entry) => entry.id === destinationId) ?? withExit[0];
  const [amount, setAmount] = useState("");
  const [legs, setLegs] = useState([{ domain: defaultSources[0]?.domain ?? 6, amount: "" }]);

  const { state, positions, quote, exit, reset } = useExit({ relayerUrl: url, destinations, destination });
  const position = positions.find((entry) => entry.destination.id === destination?.id);

  /// Legs can land on any chain the relayer serves, which is what its health says, except the
  /// chain the position is on, because CCTP cannot burn toward its own domain.
  const legDomains = useMemo(() => {
    const served = new Set<number>([...(health?.exits ?? []), ...(health?.destinations ?? []), 26]);
    const known = [...served].filter((domain) => explorers[domain] && domain !== destination?.destinationDomain).sort((left, right) => left - right);
    return known.length > 0 ? known : defaultSources.map((entry) => entry.domain).filter((domain) => domain !== destination?.destinationDomain);
  }, [health, destination?.destinationDomain]);

  useEffect(() => {
    setLegs((current) => (current.every((leg) => legDomains.includes(leg.domain)) ? current : current.map((leg) => (legDomains.includes(leg.domain) ? leg : { ...leg, domain: legDomains[0] }))));
  }, [legDomains]);

  useEffect(() => {
    const held = positions.find((entry) => entry.destination.id === destinationId);
    if (held && held.balance > 0n) return;
    const funded = positions.find((entry) => entry.balance > 0n);
    if (funded) setDestinationId(funded.destination.id);
  }, [positions, destinationId]);

  const phase = useRef(state.phase);
  phase.current = state.phase;

  useEffect(() => {
    if (state.record) onExit?.(state.record);
  }, [state.record, onExit]);

  useEffect(() => {
    if (signedIn) return;
    reset();
  }, [signedIn, reset]);

  useEffect(() => {
    if (!signedIn || !address || !destination) return;
    const handle = setTimeout(() => {
      if (["signing", "sending", "tracking", "done"].includes(phase.current)) return;
      void quote(
        amount,
        legs.map((leg, index) => ({ domain: leg.domain, amount: index === legs.length - 1 ? undefined : parseUsdc(leg.amount) })),
      );
    }, 400);
    return () => clearTimeout(handle);
  }, [amount, legs, signedIn, address, destination, quote]);

  const busy = ["signing", "sending"].includes(state.phase);
  const quoting = state.phase === "quoting";
  const tracking = state.phase === "tracking" || state.phase === "done";
  const spec = destination?.exit;
  const fees = state.quote?.legs.reduce((total, leg) => total + leg.fee, 0n) ?? 0n;

  const setLeg = (index: number, next: { domain?: number; amount?: string }) => setLegs((current) => current.map((leg, at) => (at === index ? { ...leg, ...next } : leg)));

  return (
    <section className="inlet">
      {header === undefined ? (
        <header className="inlet-header">
          <h2 className="inlet-title">
            {title}
            <span className={`inlet-relayer inlet-relayer-${relayerStatus}`} title={url}>
              {relayerStatus === "online" ? "relayer online" : relayerStatus === "offline" ? `relayer unreachable at ${url}` : "checking relayer"}
            </span>
          </h2>
          <AccountPill />
        </header>
      ) : (
        header
      )}

      {tracking && state.record ? (
        <div className="inlet-body">
          <ExitTimeline record={state.record} />
          {state.phase === "done" ? (
            <button className="inlet-secondary" type="button" onClick={reset}>
              New withdrawal
            </button>
          ) : null}
        </div>
      ) : withExit.length === 0 || !destination || !spec ? (
        <div className="inlet-body">
          <p className="inlet-note">No position on this wallet can be withdrawn yet. A position becomes withdrawable once the exit rail is deployed on the chain it lives on.</p>
        </div>
      ) : (
        <div className="inlet-body">
          <label className="inlet-field">
            <span>From</span>
            <select id="inlet-position" name="position" value={destination.id} onChange={(event) => setDestinationId(event.target.value)} disabled={busy}>
              {withExit.map((entry) => {
                const held = positions.find((item) => item.destination.id === entry.id);
                return (
                  <option key={entry.id} value={entry.id} disabled={held?.balance === 0n}>
                    {held ? `${entry.name} · ${usdc(held.assets)}` : entry.name}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="inlet-field">
            <span>Amount</span>
            <div className="inlet-row">
              <input id="inlet-exit-amount" name="exitAmount" inputMode="decimal" placeholder="0" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} />
              <button type="button" className="inlet-chip" onClick={() => position && setAmount(formatUnits(position.assets, 6))} disabled={busy || !position?.assets}>
                Max
              </button>
            </div>
          </label>

          <div className="inlet-legs">
            <span className="inlet-legs-label">To</span>
            {legs.map((leg, index) => {
              const last = index === legs.length - 1;
              return (
                <div className="inlet-leg" key={index}>
                  <select name={`leg-${index}`} value={leg.domain} onChange={(event) => setLeg(index, { domain: Number(event.target.value) })} disabled={busy}>
                    {legDomains.map((domain) => (
                      <option key={domain} value={domain}>
                        {chainNameForDomain(domain)}
                      </option>
                    ))}
                  </select>
                  {last ? (
                    <span className="inlet-rest">the rest</span>
                  ) : (
                    <input name={`leg-amount-${index}`} inputMode="decimal" placeholder="0" value={leg.amount} onChange={(event) => setLeg(index, { amount: event.target.value })} disabled={busy} />
                  )}
                  {last ? null : (
                    <button type="button" className="inlet-icon" onClick={() => setLegs((current) => current.filter((_, at) => at !== index))} disabled={busy} aria-label={`Remove ${chainNameForDomain(leg.domain)}`}>
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4.5 4.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
            {legs.length < maxLegs ? (
              <div className="inlet-legs-add">
                <button type="button" className="inlet-chip" onClick={() => setLegs((current) => [...current, { domain: legDomains.find((domain) => !current.some((leg) => leg.domain === domain)) ?? legDomains[0], amount: "" }])} disabled={busy}>
                  Add a chain
                </button>
              </div>
            ) : null}
          </div>

          {signedIn && state.quote ? (
            <dl className={`inlet-quote ${quoting ? "inlet-quote-stale" : ""}`}>
              <div>
                <dt>Position redeemed</dt>
                <dd>{tokens(state.quote.position, spec.positionDecimals, spec.positionLabel)}</dd>
              </div>
              <div>
                <dt>USDC out, at least</dt>
                <dd>{usdc(state.quote.minAssets)}</dd>
              </div>
              <div>
                <dt>Circle fee, at most</dt>
                <dd>{usdc(fees)}</dd>
              </div>
              {state.quote.legs.map((leg, index) => (
                <div key={`${leg.domain}-${index}`}>
                  <dt>Lands on {chainNameForDomain(leg.domain)}</dt>
                  <dd>{usdc(leg.lands)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {relayerStatus === "offline" && !state.quote?.blocker ? <p className="inlet-warn">The relayer at {url} is not answering, so nothing can be submitted right now.</p> : null}
          {state.quote?.blocker ? <p className="inlet-warn">{state.quote.blocker}</p> : null}
          {state.error ? <p className="inlet-warn">{state.error}</p> : null}

          {!signedIn ? (
            <button
              className="inlet-primary"
              type="button"
              disabled={!inlet.ready || inlet.connecting}
              onClick={() => (inlet.login ? inlet.login() : connectors[0] ? connect({ connector: connectors[0] }) : undefined)}
            >
              {inlet.connecting ? "Waiting for your wallet" : inlet.login ? "Log in to withdraw" : "Connect a wallet to withdraw"}
            </button>
          ) : (
            <button className="inlet-primary" type="button" disabled={!state.quote || !state.quote.ready || busy || quoting || relayerStatus !== "online"} onClick={() => state.quote && void exit(state.quote)}>
              {state.phase === "signing" ? "Waiting for your wallet" : state.phase === "sending" ? "Sending" : quoting ? "Quoting" : "Withdraw"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
