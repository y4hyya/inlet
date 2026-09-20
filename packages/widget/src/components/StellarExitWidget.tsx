import { InletRelayerClient, explorerLink, isStellarAccount, testnetChains, testnetDeployments, toBytes32, type ExitRecord } from "@inletkit/sdk";
import type { StellarSigner } from "@inletkit/sdk/stellar";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits, isAddress, type Address } from "viem";
import { chainNameForDomain, defaultSources } from "../config.js";
import { useInlet } from "../context.js";
import { parseUsdc, short, usdc } from "../format.js";
import type { Destination, Phase } from "../types.js";
import { ExitTimeline } from "./ExitTimeline.js";

export interface StellarWallet {
  address: string;
  // The wallet kit's own shape, so a host can pass its signer straight through.
  signTransaction: StellarSigner;
}

export interface StellarExitWidgetProps {
  destination: Destination;
  stellar: StellarWallet;
  recipient?: Address;
  relayerUrl?: string;
  defaultAmount?: string;
  title?: string;
  header?: ReactNode;
  onExit?: (record: ExitRecord) => void;
}

const network = testnetChains.stellarTestnet;
const exitContract = testnetDeployments.stellarTestnet.inletExit;
const evmDomains = defaultSources.filter((entry) => entry.kind === "evm").map((entry) => entry.domain);

/// Takes a Stellar position back out to any chain the trader names. The trader signs once, in their own wallet, and the relayer mints on the far side.
export function StellarExitWidget({ destination, stellar, recipient, relayerUrl, defaultAmount = "1", title = "Withdraw to any chain", header, onExit }: StellarExitWidgetProps) {
  const inlet = useInlet();
  const url = relayerUrl ?? inlet.relayerUrl;
  const [amount, setAmount] = useState(defaultAmount);
  const [domain, setDomain] = useState(evmDomains[0] ?? 6);
  const [to, setTo] = useState<string>(recipient ?? "");
  const [margin, setMargin] = useState<{ amount: bigint; exact: boolean }>();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [refusal, setRefusal] = useState<string>();
  const [checking, setChecking] = useState(false);
  const [record, setRecord] = useState<ExitRecord>();
  const poller = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => setTo((current) => current || recipient || ""), [recipient]);

  const readMargin = useCallback(async () => {
    if (!isStellarAccount(stellar.address)) return;
    try {
      const { readStellarMargin } = await import("@inletkit/sdk/stellar");
      setMargin(await readStellarMargin({ rpc: network.rpc, passphrase: network.network, exit: exitContract, trader: stellar.address }));
    } catch {
      setMargin(undefined);
    }
  }, [stellar.address]);

  useEffect(() => {
    void readMargin();
  }, [readMargin]);

  useEffect(() => () => clearInterval(poller.current), []);

  const units = parseUsdc(amount);
  // The market keeps seven decimals and a leg carries six, so a whole leg is ten of the market's units.
  const ceiling = margin?.exact ? margin.amount : undefined;
  const blocker = !isStellarAccount(stellar.address)
    ? "Connect a Stellar wallet to withdraw."
    : !isAddress(to)
      ? "Enter the address that receives the USDC."
      : !units
        ? "Enter an amount."
        : ceiling !== undefined && units * 10n > ceiling
          ? `That is more than the ${usdc(ceiling / 10n)} you can take out.`
          : refusal;

  // The balance the market reports counts an open position, so the only honest test is to ask the network itself.
  useEffect(() => {
    if (!units || !isAddress(to) || !isStellarAccount(stellar.address) || phase === "signing" || phase === "sending") return;
    let dropped = false;
    setChecking(true);
    const handle = setTimeout(async () => {
      try {
        const { simulateStellarExit } = await import("@inletkit/sdk/stellar");
        const outcome = await simulateStellarExit({
          rpc: network.rpc,
          passphrase: network.network,
          exit: exitContract,
          trader: stellar.address,
          legs: [{ domain, recipient: toBytes32(to as Address), amount: units }],
        });
        if (!dropped) setRefusal(outcome.ok ? undefined : outcome.error);
      } catch (cause) {
        if (!dropped) setRefusal(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!dropped) setChecking(false);
      }
    }, 500);
    return () => {
      dropped = true;
      clearTimeout(handle);
    };
  }, [units, to, domain, stellar.address, phase]);

  const track = useCallback(
    (hash: `0x${string}`) => {
      const relayer = new InletRelayerClient(url);
      clearInterval(poller.current);
      poller.current = setInterval(async () => {
        try {
          const next = await relayer.getExit(hash);
          setRecord(next);
          onExit?.(next);
          if (next.state === "delivered") {
            clearInterval(poller.current);
            setPhase("done");
            void readMargin();
          }
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }, 2000);
    },
    [url, onExit, readMargin],
  );

  const withdraw = async () => {
    if (blocker || !units) return;
    setError(undefined);
    try {
      setPhase("signing");
      const { buildStellarExit, sendStellarExit, signStellarExit } = await import("@inletkit/sdk/stellar");
      const unsigned = await buildStellarExit({
        rpc: network.rpc,
        passphrase: network.network,
        exit: exitContract,
        trader: stellar.address,
        legs: [{ domain, recipient: toBytes32(to as Address), amount: units }],
      });
      const signed = await signStellarExit({ xdr: unsigned, passphrase: network.network, trader: stellar.address, sign: stellar.signTransaction });
      setPhase("sending");
      const hash = await sendStellarExit({ rpc: network.rpc, passphrase: network.network, signedXdr: signed });
      const relayer = new InletRelayerClient(url);
      const created = await relayer.createStellarExit(hash, stellar.address);
      setRecord(created);
      onExit?.(created);
      setPhase("tracking");
      track(created.hash);
    } catch (cause) {
      setPhase("error");
      setError(cause instanceof Error ? cause.message.split("\n")[0].slice(0, 240) : String(cause));
    }
  };

  const busy = phase === "signing" || phase === "sending";
  const tracking = phase === "tracking" || phase === "done";

  return (
    <section className="inlet">
      {header === undefined ? (
        <header className="inlet-header">
          <h2 className="inlet-title">{title}</h2>
        </header>
      ) : (
        header
      )}

      {tracking && record ? (
        <div className="inlet-body">
          <ExitTimeline record={record} />
          <p className="inlet-hint">
            Signed on Stellar{" "}
            <a className="inlet-step-link" href={explorerLink(destination.destinationDomain, record.hash.slice(2))} target="_blank" rel="noreferrer">
              {short(record.hash)}
            </a>
          </p>
          {phase === "done" ? (
            <button
              className="inlet-secondary"
              type="button"
              onClick={() => {
                setRecord(undefined);
                setPhase("idle");
              }}
            >
              New withdrawal
            </button>
          ) : null}
        </div>
      ) : (
        <div className="inlet-body">
          <div className="inlet-field">
            <span>From</span>
            <p className="inlet-static">
              {destination.name}
              {margin === undefined ? "" : margin.exact ? ` · ${usdc(margin.amount / 10n)} free` : ` · ${usdc(margin.amount / 10n)} in the account`}
            </p>
          </div>
          <label className="inlet-field">
            <span>Amount</span>
            <div className="inlet-row">
              <input id="inlet-stellar-amount" name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} />
              <button type="button" className="inlet-chip" onClick={() => ceiling !== undefined && setAmount(formatUnits(ceiling / 10n, 6))} disabled={busy || ceiling === undefined} title={ceiling === undefined ? "The market does not report free margin yet, so enter an amount" : undefined}>
                Max
              </button>
            </div>
          </label>
          <label className="inlet-field">
            <span>To</span>
            <select id="inlet-stellar-leg" name="leg" value={domain} onChange={(event) => setDomain(Number(event.target.value))} disabled={busy}>
              {evmDomains.map((entry) => (
                <option key={entry} value={entry}>
                  {chainNameForDomain(entry)}
                </option>
              ))}
            </select>
          </label>
          <label className="inlet-field">
            <span>Address that receives</span>
            <input id="inlet-stellar-recipient" name="recipient" placeholder="0x..." spellCheck={false} autoComplete="off" value={to} onChange={(event) => setTo(event.target.value)} disabled={busy} />
          </label>

          {blocker ? <p className="inlet-warn">{blocker}</p> : null}
          {error ? <p className="inlet-warn">{error}</p> : null}

          <button className="inlet-primary" type="button" disabled={Boolean(blocker) || busy || checking} onClick={() => void withdraw()}>
            {phase === "signing" ? "Waiting for your wallet" : phase === "sending" ? "Sending" : checking ? "Checking" : "Withdraw"}
          </button>
          <p className="inlet-hint">One signature in your Stellar wallet takes it out of the position and sends it, and no gas is needed on the far side.</p>
        </div>
      )}
    </section>
  );
}
