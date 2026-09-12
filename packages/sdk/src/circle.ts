import { parseAbi, type Hex } from "viem";

export const messageTransmitterV2Abi = parseAbi([
  "function receiveMessage(bytes message, bytes attestation) returns (bool)",
  "function usedNonces(bytes32 nonce) view returns (uint256)",
]);

export const tokenMessengerV2Abi = parseAbi([
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)",
  "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes hookData)",
]);

export const gatewayWalletAbi = parseAbi([
  "function deposit(address token, uint256 value)",
  "function depositFor(address token, address depositor, uint256 value)",
  "function addDelegate(address token, address delegate)",
  "function removeDelegate(address token, address delegate)",
]);

export const gatewayMinterAbi = parseAbi([
  "function gatewayMint(bytes attestationPayload, bytes signature)",
]);

export type AttestationStatus = "complete" | "pending_confirmations" | string;

export interface IrisMessage {
  message: Hex;
  attestation: Hex | "PENDING";
  eventNonce: string;
  cctpVersion: number;
  status: AttestationStatus;
  decodedMessage?: Record<string, unknown>;
}

export interface BurnFee {
  finalityThreshold: number;
  minimumFee: number;
}

export class IrisClient {
  constructor(private readonly baseUrl: string) {}

  async getMessages(sourceDomain: number, transactionHash: string): Promise<IrisMessage[]> {
    const response = await fetch(
      `${this.baseUrl}/v2/messages/${sourceDomain}?transactionHash=${transactionHash}`,
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Iris ${response.status}: ${await response.text()}`);
    const body = (await response.json()) as { messages?: IrisMessage[] };
    return body.messages ?? [];
  }

  async getBurnFees(sourceDomain: number, destinationDomain: number): Promise<BurnFee[]> {
    const response = await fetch(
      `${this.baseUrl}/v2/burn/USDC/fees/${sourceDomain}/${destinationDomain}`,
    );
    if (!response.ok) throw new Error(`Iris ${response.status}: ${await response.text()}`);
    return (await response.json()) as BurnFee[];
  }

  async fastTransferMaxFee(sourceDomain: number, destinationDomain: number, amount: bigint): Promise<bigint> {
    const fees = await this.getBurnFees(sourceDomain, destinationDomain);
    const fast = fees.find((fee) => fee.finalityThreshold <= 1000) ?? fees[0];
    const milliBps = fast ? BigInt(Math.round(fast.minimumFee * 1000)) : 0n;
    return (amount * milliBps) / 10_000_000n + 1n;
  }
}
