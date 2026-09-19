import { stellarContractToBytes32, stellarDomain } from "@inletkit/sdk";
import { BASE_FEE, Contract, Keypair, TransactionBuilder, nativeToScVal, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
import type { Hex } from "viem";

export interface StellarSettings {
  rpc: string;
  passphrase: string;
  secret: string;
  receiver: string;
}

function bytes(value: Hex): xdr.ScVal {
  return nativeToScVal(Buffer.from(value.slice(2), "hex"), { type: "bytes" });
}

/// The Stellar leg of a deposit. The receiver mints through Circle and deposits in one call, so this only has to send it.
export class StellarLeg {
  readonly domain = stellarDomain;
  readonly receiverBytes32: Hex;
  private readonly server: rpc.Server;
  private readonly keypair: Keypair;
  private readonly contract: Contract;

  constructor(private readonly settings: StellarSettings) {
    this.server = new rpc.Server(settings.rpc);
    this.keypair = Keypair.fromSecret(settings.secret);
    this.contract = new Contract(settings.receiver);
    this.receiverBytes32 = stellarContractToBytes32(settings.receiver);
  }

  get address(): string {
    return this.keypair.publicKey();
  }

  get receiver(): string {
    return this.settings.receiver;
  }

  private async build(method: string, args: xdr.ScVal[]) {
    const account = await this.server.getAccount(this.keypair.publicKey());
    return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: this.settings.passphrase })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(60)
      .build();
  }

  async executed(intentHash: Hex): Promise<boolean> {
    const simulation = await this.server.simulateTransaction(await this.build("executed", [bytes(intentHash)]));
    if (rpc.Api.isSimulationError(simulation)) throw new Error(`the receiver on Stellar could not be read: ${simulation.error}`);
    return simulation.result ? Boolean(scValToNative(simulation.result.retval)) : false;
  }

  /// True when the receiver deposited for the beneficiary, false when it kept the USDC claimable.
  async receiveAndExecute(message: Hex, attestation: Hex): Promise<{ hash: string; deposited: boolean }> {
    const prepared = await this.server.prepareTransaction(await this.build("receive_and_execute", [bytes(message), bytes(attestation)]));
    prepared.sign(this.keypair);
    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === "ERROR") throw new Error(`Stellar refused the transaction ${sent.hash}`);

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const found = await this.server.getTransaction(sent.hash);
      if (found.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash: sent.hash, deposited: found.returnValue ? Boolean(scValToNative(found.returnValue)) : false };
      }
      if (found.status === rpc.Api.GetTransactionStatus.FAILED) throw new Error(`receive_and_execute failed in ${sent.hash}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`Stellar did not confirm ${sent.hash} in time`);
  }
}
