"use client";

import { InletRelayerClient, testnetSources, toBytes32, type ExitRecord, type ExitState, type IntentRecord } from "@inletkit/sdk";
import { ExitTimeline, InletWidget, StatusTimeline, findDestination, testnetDestinations, type InletMode } from "@inletkit/widget";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { short } from "@/lib/format";
import { exits, runs } from "@/lib/runs";
import { site } from "@/lib/site";
import { ExitFlow } from "./exit-flow";
import { Flow, finals, order, type FlowView } from "./flow";
import { lastStepFor, Replay, type ReplayState } from "./replay";
import styles from "./app.module.css";

const stepMs = 1500;

function sourceName(domain: number) {
  return testnetSources.find((entry) => entry.domain === domain)?.name ?? `domain ${domain}`;
}

function viewFromRecord(record: IntentRecord, mode: "live" | "follow"): FlowView {
  const destination = findDestination(record);
  const amount = Number(record.intent.amount) / 1_000_000;
  return {
    mode,
    state: record.state,
    route: record.route,
    sourceDomain: record.intent.sourceDomain,
    sourceName: sourceName(record.intent.sourceDomain),
    destinationDomain: record.intent.destinationDomain,
    destinationName: destination?.name ?? `domain ${record.intent.destinationDomain}`,
    positionLabel: destination?.positionLabel ?? "Position",
    amount: amount.toLocaleString("en-US", { maximumFractionDigits: 6 }),
    sourceTx: record.sourceTx,
    arcMintTx: record.arcMintTx,
    sweepTx: record.sweepTx,
    destinationTx: record.destinationTx,
    refundTx: record.refundTx,
    refundMintTx: record.refundMintTx,
    error: record.error,
    seconds: finals.has(record.state) ? Math.max(1, Math.round((record.updatedAt - record.createdAt) / 1000)) : undefined,
  };
}

function viewFromReplay(state: ReplayState): FlowView | undefined {
  const run = runs.find((entry) => entry.id === state.runId);
  if (!run) return undefined;
  return {
    mode: "replay",
    state: order[state.step],
    route: run.route,
    sourceDomain: run.sourceDomain,
    sourceName: run.sourceName,
    destinationDomain: run.destinationDomain,
    destinationName: run.destinationName,
    positionLabel: run.position,
    amount: run.amount.replace(" USDC", ""),
    sourceTx: run.sourceTx,
    arcMintTx: state.step >= 1 ? run.arcMintTx : undefined,
    sweepTx: state.step >= 2 ? run.sweepTx : undefined,
    destinationTx: state.step >= 4 ? run.destinationTx : undefined,
    seconds: state.step >= 4 ? run.seconds : undefined,
  };
}

const exitOrder: ExitState[] = ["signed", "executed", "attested", "delivered"];

function exitFromReplay(state: ReplayState): ExitRecord | undefined {
  const run = exits.find((entry) => entry.id === state.runId);
  if (!run) return undefined;
  const step = Math.min(state.step, exitOrder.length - 1);
  const owner = "0xFDeA5eBbe7970A00792562e1C5299215CF6A3813";
  const received = BigInt(run.receivedUnits);
  return {
    hash: run.hash,
    state: exitOrder[step],
    domain: run.positionDomain,
    intent: { owner, adapterId: "0x", adapterData: "0x", amount: 0n, minAssets: received, legs: run.legs.map((leg) => ({ domain: leg.domain, recipient: toBytes32(owner), amount: 0n })), nonce: 0n, deadline: 0n, maxFeeBps: 0 },
    executor: run.executor,
    exitTx: step >= 1 ? run.exitTx : undefined,
    received: step >= 1 ? received : undefined,
    legs: run.legs.map((leg) => ({ domain: leg.domain, recipient: toBytes32(owner), amount: 0n, attested: step >= 2, mintTx: step >= 3 ? leg.mintTx : undefined })),
    createdAt: 0,
    updatedAt: run.seconds * 1000,
  };
}

export function AppView() {
  const router = useRouter();
  const params = useSearchParams();
  const hashParam = params.get("hash");
  const destinationParam = params.get("destination") ?? undefined;

  const [mode, setMode] = useState<InletMode>("deposit");
  const [exit, setExit] = useState<ExitRecord>();
  const [live, setLive] = useState<IntentRecord>();
  const [followed, setFollowed] = useState<IntentRecord>();
  const [followedExit, setFollowedExit] = useState<ExitRecord>();
  const [followError, setFollowError] = useState<string>();
  const [focus, setFocus] = useState<"record" | "replay">("record");
  const [replay, setReplay] = useState<ReplayState>({ runId: runs[0].id, step: 0, playing: false });
  const [hashInput, setHashInput] = useState(hashParam ?? "");

  const onExit = useCallback((record: ExitRecord) => {
    setExit(record);
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hash") !== record.hash) {
      window.history.replaceState(null, "", `/app?hash=${record.hash}`);
    }
  }, []);

  const onRecord = useCallback((record: IntentRecord) => {
    setLive(record);
    setFocus("record");
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("hash") !== record.hash) {
      window.history.replaceState(null, "", `/app?hash=${record.hash}`);
    }
  }, []);

  // A hash names either a deposit or a withdrawal. The relayer keeps them apart, so ask for
  // the deposit first and fall back to the withdrawal.
  useEffect(() => {
    if (!hashParam || hashParam === live?.hash || hashParam === exit?.hash) {
      setFollowed(undefined);
      setFollowedExit(undefined);
      setFollowError(undefined);
      return;
    }
    const client = new InletRelayerClient(site.relayerUrl);
    const hash = hashParam as `0x${string}`;
    let stopped = false;
    let handle = 0;
    const load = () =>
      client
        .getIntent(hash)
        .then((record) => {
          if (stopped) return;
          setFollowed(record);
          setFollowedExit(undefined);
          setFollowError(undefined);
          setFocus("record");
          if (!finals.has(record.state)) handle = window.setTimeout(load, 3000);
        })
        .catch(() =>
          client.getExit(hash).then((record) => {
            if (stopped) return;
            setFollowedExit(record);
            setFollowed(undefined);
            setFollowError(undefined);
            setFocus("record");
            if (record.state !== "delivered") handle = window.setTimeout(load, 3000);
          }),
        )
        .catch((cause) => {
          if (stopped) return;
          setFollowError(cause instanceof Error ? cause.message : String(cause));
          handle = window.setTimeout(load, 6000);
        });
    void load();
    return () => {
      stopped = true;
      window.clearTimeout(handle);
    };
  }, [hashParam, live?.hash, exit?.hash]);

  useEffect(() => {
    if (focus !== "replay" || !replay.playing) return;
    if (replay.step >= lastStepFor(replay.runId)) {
      setReplay((current) => ({ ...current, playing: false }));
      return;
    }
    const handle = window.setTimeout(() => setReplay((current) => ({ ...current, step: Math.min(lastStepFor(current.runId), current.step + 1) })), stepMs);
    return () => window.clearTimeout(handle);
  }, [focus, replay.playing, replay.step]);

  const record = live ?? followed;
  const view = useMemo<FlowView | undefined>(() => {
    if (focus === "replay") return viewFromReplay(replay);
    if (record) return viewFromRecord(record, live ? "live" : "follow");
    return undefined;
  }, [focus, replay, record, live]);

  const follow = (event: FormEvent) => {
    event.preventDefault();
    const value = hashInput.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
      setFollowError("A hash is 32 bytes, 0x followed by 64 hex characters.");
      return;
    }
    setLive(undefined);
    setFocus("record");
    router.push(`/app?hash=${value}`);
  };

  const followedDestination = followed ? findDestination(followed) ?? testnetDestinations[0] : undefined;
  const shownExit = mode === "withdraw" && exit ? exit : !live && followedExit ? followedExit : undefined;
  const replayExit = focus === "replay" ? exitFromReplay(replay) : undefined;
  const liveExit = focus === "replay" ? undefined : shownExit;

  return (
    <section className={`rail ${styles.app}`}>
      <div className={styles.head}>
        <div className={styles.intro}>
          <p className="eyebrow">Live on testnet</p>
          <h1 className={styles.title}>Try a deposit.</h1>
          <p className={styles.sub}>
            Real USDC on Base Sepolia, Arbitrum Sepolia or Unichain Sepolia, settled through Arc. Log in with an email or a wallet, pick a destination, sign once, and watch it move. Testnet USDC comes from{" "}
            <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
              Circle&apos;s faucet
            </a>
            .
          </p>
        </div>
        <form className={styles.follow} onSubmit={follow}>
          <label className={styles.followLabel} htmlFor="follow-hash">
            Follow a deposit or a withdrawal by hash
          </label>
          <div className={styles.followRow}>
            <input id="follow-hash" className={styles.followInput} value={hashInput} onChange={(event) => setHashInput(event.target.value)} placeholder="0x…" spellCheck={false} autoComplete="off" />
            <button type="submit" className="btn btn-secondary">
              Follow
            </button>
          </div>
          {followError ? <p className={styles.followError}>{followError}</p> : null}
        </form>
      </div>

      <div className={styles.grid}>
        <div className={styles.left}>
          <InletWidget destinations={testnetDestinations} defaultDestinationId={destinationParam} onModeChange={setMode} onRecord={onRecord} onExit={onExit} />
          <p className={styles.caption}>The same widget a protocol mounts. Wallet agnostic, runs on wagmi, Privy only for the login here.</p>
        </div>
        <div className={styles.right}>
          {liveExit ? (
            <ExitFlow record={liveExit} />
          ) : (
            <>
              {replayExit ? <ExitFlow record={replayExit} /> : <Flow view={view} />}
              <Replay
                state={replay}
                active={focus === "replay"}
                onChange={(next) => {
                  setReplay(next);
                  setFocus("replay");
                }}
              />
            </>
          )}
        </div>
      </div>

      {followed && followedDestination ? (
        <div className={styles.record}>
          <p className={styles.recordHead}>
            <span className="eyebrow">Intent</span>
            <code className={styles.recordHash}>{short(followed.hash, 10, 8)}</code>
            <span className={styles.recordState}>{followed.state}</span>
          </p>
          <StatusTimeline record={followed} destination={followedDestination} sourceExplorer={testnetSources.find((entry) => entry.domain === followed.intent.sourceDomain)?.explorer} />
        </div>
      ) : followedExit ? (
        <div className={styles.record}>
          <p className={styles.recordHead}>
            <span className="eyebrow">Withdrawal</span>
            <code className={styles.recordHash}>{short(followedExit.hash, 10, 8)}</code>
            <span className={styles.recordState}>{followedExit.state}</span>
          </p>
          <ExitTimeline record={followedExit} />
        </div>
      ) : null}
    </section>
  );
}
