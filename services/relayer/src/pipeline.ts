import {
  GatewayClient,
  IrisClient,
  gatewayMinterAbi,
  inletExitAbi,
  inletHubAbi,
  inletReceiverAbi,
  messageTransmitterV2Abi,
  type ExitState,
  type IntentState,
} from "@inletkit/sdk";
import { erc20Abi, hexToNumber, parseEventLogs, slice, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import type { ChainContext } from "./chains.js";
import type { RelayerConfig } from "./config.js";
import { serializeExitLegs, type ExitStore, type IntentStore, type StoredExit, type StoredIntent } from "./db.js";
import { log } from "./log.js";

export class Pipeline {
  constructor(
    private readonly config: RelayerConfig,
    private readonly chains: Record<number, ChainContext>,
    private readonly account: PrivateKeyAccount,
    private readonly store: IntentStore,
    private readonly exits: ExitStore,
    private readonly iris: IrisClient,
    private readonly gateway: GatewayClient,
  ) {}

  async tick() {
    for (const record of this.store.listByState(["created"])) await this.guarded(record, () => this.fund(record));
    for (const record of this.store.listByState(["funded"])) await this.guarded(record, () => this.sweep(record));
    for (const record of this.store.listByState(["swept"])) await this.guarded(record, () => this.attest(record));
    for (const record of this.store.listByState(["attested"])) await this.guarded(record, () => this.execute(record));
    for (const record of this.store.listByState(["refunding"])) await this.guarded(record, () => this.completeRefund(record));
    for (const record of this.exits.listByState(["signed"])) await this.guardedExit(record, () => this.redeem(record));
    for (const record of this.exits.listByState(["executed"])) await this.guardedExit(record, () => this.attestExit(record));
    for (const record of this.exits.listByState(["attested"])) await this.guardedExit(record, () => this.deliver(record));
  }

  private async guarded(record: StoredIntent, step: () => Promise<void>) {
    return this.attempt(record, step, (error) => this.store.update(record.hash, { error }));
  }

  private async guardedExit(record: StoredExit, step: () => Promise<void>) {
    return this.attempt(record, step, (error) => this.exits.update(record.hash, { error }));
  }

  private async attempt(record: { hash: Hex; state: string; error?: string; updatedAt: number }, step: () => Promise<void>, fail: (error: string) => void) {
    const backoff = record.error && /nonce/i.test(record.error) ? 5_000 : 30_000;
    if (record.error && Date.now() - record.updatedAt < backoff) return;
    try {
      await step();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("pipeline", `${record.state} step failed for ${record.hash}: ${message.slice(0, 300)}`);
      fail(message.slice(0, 1000));
    }
  }

  private get arc() {
    return this.chains[this.config.hubDomain];
  }

  private async depositBalance(record: StoredIntent) {
    return this.arc.publicClient.readContract({
      address: this.arc.usdc,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [record.depositAddress],
    });
  }

  private transition(record: StoredIntent, state: IntentState, patch: Record<string, string | null> = {}) {
    log("pipeline", `${record.hash} ${record.state} to ${state}`, patch);
    return this.store.update(record.hash, { state, error: null, ...patch });
  }

  async fund(record: StoredIntent) {
    const balance = await this.depositBalance(record);
    if (balance >= record.intent.amount) {
      this.transition(record, "funded");
      return;
    }

    const now = BigInt(Math.floor(Date.now() / 1000));
    if (now > record.intent.deadline) {
      if (balance > 0n) await this.refund(record);
      else this.transition(record, "expired");
      return;
    }

    if (record.route === "cctp" && record.sourceTx && !record.arcMintTx) {
      await this.mintOnArc(record);
    }
    if (record.route === "gateway" && record.gatewayRequest && !record.arcMintTx) {
      await this.mintFromGateway(record);
    }
  }

  private async mintFromGateway(record: StoredIntent) {
    let attestation = record.gatewayAttestation;
    if (!attestation) {
      attestation = await this.gateway.transfer([record.gatewayRequest!]);
      this.store.update(record.hash, { gateway_attestation: JSON.stringify(attestation) });
      log("pipeline", `${record.hash} gateway attestation received`, { transferId: attestation.transferId });
    }
    const hash = await this.arc.walletClient.writeContract({
      address: this.arc.gatewayMinter,
      abi: gatewayMinterAbi,
      functionName: "gatewayMint",
      args: [attestation.attestation, attestation.signature],
      account: this.account,
      chain: this.arc.chain,
      gas: 600_000n,
    });
    const receipt = await this.arc.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`gatewayMint reverted in ${hash}`);
    log("pipeline", `${record.hash} minted on Arc from Gateway`, { tx: hash });
    this.store.update(record.hash, { arc_mint_tx: hash });
  }

  private async mintOnArc(record: StoredIntent) {
    const messages = await this.iris.getMessages(record.intent.sourceDomain, record.sourceTx!);
    const ready = messages.find((message) => message.status === "complete" && message.attestation !== "PENDING");
    if (!ready) return;

    const nonce = slice(ready.message, 12, 44);
    const used = await this.arc.publicClient.readContract({
      address: this.arc.messageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "usedNonces",
      args: [nonce],
    });
    if (used === 1n) {
      this.store.update(record.hash, { arc_mint_tx: "external" });
      return;
    }

    const hash = await this.arc.walletClient.writeContract({
      address: this.arc.messageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "receiveMessage",
      args: [ready.message, ready.attestation as Hex],
      account: this.account,
      chain: this.arc.chain,
      gas: 600_000n,
    });
    await this.arc.publicClient.waitForTransactionReceipt({ hash });
    log("pipeline", `${record.hash} minted on Arc`, { tx: hash });
    this.store.update(record.hash, { arc_mint_tx: hash });
  }

  async sweep(record: StoredIntent) {
    const status = await this.arc.publicClient.readContract({
      address: this.config.hub,
      abi: inletHubAbi,
      functionName: "status",
      args: [record.hash],
    });

    if (status === 0) {
      const hash = await this.arc.walletClient.writeContract({
        address: this.config.hub,
        abi: inletHubAbi,
        functionName: "sweep",
        args: [record.intent],
        account: this.account,
        chain: this.arc.chain,
        gas: this.arc.fixedGas,
      });
      const receipt = await this.arc.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`sweep reverted in ${hash}`);
      this.transition(record, "swept", { sweep_tx: hash });
      return;
    }

    if (status === 1) {
      const sweepTx = record.sweepTx ?? (await this.findSweep(record));
      this.transition(record, "swept", { sweep_tx: sweepTx });
      return;
    }

    this.transition(record, "refunded");
  }

  private async findSweep(record: StoredIntent): Promise<Hex> {
    const logs = await this.arc.publicClient.getContractEvents({
      address: this.config.hub,
      abi: inletHubAbi,
      eventName: "Swept",
      args: { intentHash: record.hash },
      fromBlock: BigInt(record.createdBlock),
      toBlock: "latest",
    });
    const event = logs[0];
    if (!event) throw new Error("hub reports swept but no Swept event was found");
    return event.transactionHash;
  }

  async attest(record: StoredIntent) {
    const messages = await this.iris.getMessages(this.config.hubDomain, record.sweepTx!);
    const ready = messages.find((message) => message.status === "complete" && message.attestation !== "PENDING");
    if (!ready) return;
    this.transition(record, "attested", { message: ready.message, attestation: ready.attestation as string });
  }

  async execute(record: StoredIntent) {
    const domain = record.intent.destinationDomain;
    const destination = this.chains[domain];
    const receiver = this.config.receivers[domain];
    if (!destination || !receiver) throw new Error(`no executor for destination domain ${domain}`);

    const executed = await destination.publicClient.readContract({
      address: receiver,
      abi: inletReceiverAbi,
      functionName: "executed",
      args: [record.hash],
    });
    if (executed) {
      this.transition(record, "executed", { result: "executed by another party" });
      return;
    }

    const nonce = slice(record.message!, 12, 44);
    const used = await destination.publicClient.readContract({
      address: destination.messageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "usedNonces",
      args: [nonce],
    });

    const hash =
      used === 1n
        ? await destination.walletClient.writeContract({
            address: receiver,
            abi: inletReceiverAbi,
            functionName: "execute",
            args: [record.message!],
            account: this.account,
            chain: destination.chain,
            gas: destination.fixedGas,
          })
        : await destination.walletClient.writeContract({
            address: receiver,
            abi: inletReceiverAbi,
            functionName: "receiveAndExecute",
            args: [record.message!, record.attestation!],
            account: this.account,
            chain: destination.chain,
            gas: destination.fixedGas,
          });
    const receipt = await destination.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`execute reverted in ${hash}`);

    const events = parseEventLogs({ abi: inletReceiverAbi, logs: receipt.logs });
    const outcome = events.find((event) => event.eventName === "Executed" || event.eventName === "MadeClaimable");
    const state: IntentState = outcome?.eventName === "Executed" ? "executed" : "claimable";
    const result = outcome ? JSON.stringify(outcome.args, (_, value) => (typeof value === "bigint" ? value.toString() : value)) : null;
    this.transition(record, state, { destination_tx: hash, result });
  }

  async refund(record: StoredIntent) {
    const hash = await this.arc.walletClient.writeContract({
      address: this.config.hub,
      abi: inletHubAbi,
      functionName: "refund",
      args: [record.intent],
      account: this.account,
      chain: this.arc.chain,
      gas: this.arc.fixedGas,
    });
    const receipt = await this.arc.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`refund reverted in ${hash}`);
    this.transition(record, "refunding", { refund_tx: hash });
  }

  async completeRefund(record: StoredIntent) {
    const messages = await this.iris.getMessages(this.config.hubDomain, record.refundTx!);
    const ready = messages.find((message) => message.status === "complete" && message.attestation !== "PENDING");
    if (!ready) return;

    const source = this.chains[record.intent.sourceDomain];
    if (!source) throw new Error(`no client for source domain ${record.intent.sourceDomain}`);
    const nonce = slice(ready.message, 12, 44);
    const used = await source.publicClient.readContract({
      address: source.messageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "usedNonces",
      args: [nonce],
    });
    if (used === 1n) {
      this.transition(record, "refunded", { refund_mint_tx: "external" });
      return;
    }
    const hash = await source.walletClient.writeContract({
      address: source.messageTransmitter,
      abi: messageTransmitterV2Abi,
      functionName: "receiveMessage",
      args: [ready.message, ready.attestation as Hex],
      account: this.account,
      chain: source.chain,
      gas: source.fixedGas,
    });
    const receipt = await source.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`refund mint reverted in ${hash}`);
    this.transition(record, "refunded", { refund_mint_tx: hash });
  }

  private transitionExit(record: StoredExit, state: ExitState, patch: Record<string, string | null> = {}) {
    const { legs_json: _legs, ...loggable } = patch;
    log("pipeline", `${record.hash} ${record.state} to ${state}`, loggable);
    return this.exits.update(record.hash, { state, error: null, ...patch });
  }

  async redeem(record: StoredExit) {
    const position = this.chains[record.domain];
    const exit = this.config.exits[record.domain];
    if (!position || !exit) throw new Error(`no exit rail on domain ${record.domain}`);

    const executed = await position.publicClient.readContract({
      address: exit,
      abi: inletExitAbi,
      functionName: "executed",
      args: [record.hash],
    });
    if (executed) {
      const event = await this.findExited(record, exit);
      this.transitionExit(record, "executed", { exit_tx: event.transactionHash, received: event.args.received === undefined ? null : String(event.args.received) });
      return;
    }

    const hash = await position.walletClient.writeContract({
      address: exit,
      abi: inletExitAbi,
      functionName: "execute",
      args: [record.intent, record.signature],
      account: this.account,
      chain: position.chain,
      gas: 1_500_000n,
    });
    const receipt = await position.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`exit reverted in ${hash}`);
    const [exited] = parseEventLogs({ abi: inletExitAbi, eventName: "Exited", logs: receipt.logs });
    this.transitionExit(record, "executed", { exit_tx: hash, received: exited ? String(exited.args.received) : null });
  }

  private async findExited(record: StoredExit, exit: Address) {
    const position = this.chains[record.domain];
    const latest = await position.publicClient.getBlockNumber();
    const logs = await position.publicClient.getContractEvents({
      address: exit,
      abi: inletExitAbi,
      eventName: "Exited",
      args: { exitHash: record.hash },
      fromBlock: latest > 10_000n ? latest - 10_000n : 0n,
      toBlock: "latest",
    });
    const event = logs[0];
    if (!event) throw new Error("the exit reports executed but no Exited event was found");
    return event;
  }

  async attestExit(record: StoredExit) {
    const messages = await this.iris.getMessages(record.domain, record.exitTx!);
    const ready = messages.filter((message) => message.status === "complete" && message.attestation !== "PENDING");
    if (ready.length < record.legs.length) return;

    const taken = new Set<number>();
    const legs = record.legs.map((leg) => {
      const index = ready.findIndex(
        (message, position) =>
          !taken.has(position) &&
          hexToNumber(slice(message.message, 8, 12)) === leg.domain &&
          slice(message.message, 184, 216).toLowerCase() === leg.recipient.toLowerCase(),
      );
      if (index < 0) throw new Error(`no Circle message for the leg to domain ${leg.domain}`);
      taken.add(index);
      return { ...leg, message: ready[index].message, attested: true };
    });
    this.transitionExit(record, "attested", { legs_json: serializeExitLegs(legs) });
  }

  async deliver(record: StoredExit) {
    const messages = await this.iris.getMessages(record.domain, record.exitTx!);
    const legs = record.legs.map((leg) => ({ ...leg }));
    for (const leg of legs) {
      if (leg.mintTx) continue;
      const ready = messages.find((message) => message.message.toLowerCase() === leg.message?.toLowerCase() && message.status === "complete" && message.attestation !== "PENDING");
      if (!ready) continue;
      const destination = this.chains[leg.domain];
      if (!destination) throw new Error(`no client for leg domain ${leg.domain}`);

      const nonce = slice(ready.message, 12, 44);
      const used = await destination.publicClient.readContract({
        address: destination.messageTransmitter,
        abi: messageTransmitterV2Abi,
        functionName: "usedNonces",
        args: [nonce],
      });
      if (used === 1n) {
        leg.mintTx = "external" as Hex;
      } else {
        const hash = await destination.walletClient.writeContract({
          address: destination.messageTransmitter,
          abi: messageTransmitterV2Abi,
          functionName: "receiveMessage",
          args: [ready.message, ready.attestation as Hex],
          account: this.account,
          chain: destination.chain,
          gas: destination.fixedGas,
        });
        const receipt = await destination.publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`leg mint reverted in ${hash}`);
        leg.mintTx = hash;
      }
      this.exits.update(record.hash, { legs_json: serializeExitLegs(legs) });
    }
    if (legs.every((leg) => leg.mintTx)) this.transitionExit(record, "delivered", { legs_json: serializeExitLegs(legs) });
  }
}
