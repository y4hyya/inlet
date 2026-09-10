import type { Hex } from "viem";

export type Actor = "user" | "circle" | "contract" | "escrow" | "relayer";

export interface RecordedRun {
  id: string;
  protocol: string;
  position: string;
  route: "cctp" | "gateway";
  sourceDomain: number;
  sourceName: string;
  destinationDomain: number;
  destinationName: string;
  destinationId: string;
  amount: string;
  seconds: number;
  sourceTx?: Hex;
  arcMintTx: Hex;
  sweepTx: Hex;
  destinationTx: Hex;
  note?: string;
}

export interface RecordedExit {
  id: string;
  protocol: string;
  position: string;
  positionDomain: number;
  positionName: string;
  legs: { domain: number; name: string; mintTx: Hex; amount: string }[];
  amount: string;
  receivedUnits: number;
  seconds: number;
  hash: Hex;
  executor: Hex;
  exitTx: Hex;
  note?: string;
}

export const exits: RecordedExit[] = [
  {
    id: "exit-aave-monad",
    protocol: "Aave V3",
    position: "2 aArbSepUSDC",
    positionDomain: 3,
    positionName: "Arbitrum Sepolia",
    legs: [{ domain: 15, name: "Monad Testnet", mintTx: "0x12d1b4ddd6bedafb90ab23253c70ca3d2b753f189475ba93f9b0e44c55d291a7", amount: "the rest" }],
    amount: "2 USDC",
    receivedUnits: 2000001,
    seconds: 13,
    hash: "0xb21b5cc488f1e3bb2894aadeabeb9edbfce1223ee141280b07063a28a684ebd3",
    executor: "0xfbaa16F1C7787D0E7e22d09ecFd34DB635Ab7F25",
    exitTx: "0x4c8b160080b18cf8eadd315a20f84facee8b86f2ce79eec66c7b34c88b29466c",
    note: "One permit signed in the widget from a browser wallet, against the hosted relayer",
  },
];

export const runs: RecordedRun[] = [
  {
    id: "aave",
    protocol: "Aave V3",
    position: "999870 aArbSepUSDC",
    route: "cctp",
    sourceDomain: 6,
    sourceName: "Base Sepolia",
    destinationDomain: 3,
    destinationName: "Arbitrum Sepolia",
    destinationId: "aave-v3-arbitrum-sepolia",
    amount: "1 USDC",
    seconds: 42,
    sourceTx: "0xddb85866a1a4ce3215b2d3cdf6bd5c4c4829e077e87f97dfaea6b29f8ea2849f",
    arcMintTx: "0xecd18a65fc7b0077cb9eba7772c78ec2d6ca259292c4661374bfeca5dca2f086",
    sweepTx: "0xa8c5afb12a3f9329e462db7d6a6bb2ec2fe5dd6eb49d4aa07c4c67c9b91b9281",
    destinationTx: "0x871b4f1539a91b6196c346d8561f14ad088760f93c823a9cce8ef59a609d5170",
  },
  {
    id: "compound",
    protocol: "Compound III",
    position: "999869 USDC supplied",
    route: "cctp",
    sourceDomain: 3,
    sourceName: "Arbitrum Sepolia",
    destinationDomain: 6,
    destinationName: "Base Sepolia",
    destinationId: "compound-v3-base-sepolia",
    amount: "1 USDC",
    seconds: 32,
    sourceTx: "0x7699f680ccd74d481a328a6d8e6ee0a7d65ee3e70c61628e73ca26fd3b679032",
    arcMintTx: "0xb054d68268fd9133f014ac4a3638e273d4be6b2bdd0a7638f5238e14841c9744",
    sweepTx: "0x685680566451287675359db680ef9ac1cdaf54d1001d936e9105e1f988f168ec",
    destinationTx: "0xaa8701105bab942c3bb64615e68ce9858728488cab5c291f37283bda1e7436f4",
  },
  {
    id: "morpho",
    protocol: "Morpho Oneshot vault",
    position: "0.9998 vUSDC shares",
    route: "cctp",
    sourceDomain: 3,
    sourceName: "Arbitrum Sepolia",
    destinationDomain: 6,
    destinationName: "Base Sepolia",
    destinationId: "morpho-oneshot-base-sepolia",
    amount: "1 USDC",
    seconds: 36,
    sourceTx: "0x883317b730cf3d41001cd44e2f075fcec70f302ce0119a032ff3d7acc51e6d76",
    arcMintTx: "0x5214ebb0e48ce1ffaf968907fc4c24fad42e048968f80a15f03437e4814464cf",
    sweepTx: "0x477387bb2ca8c32a5dd2ba23f9fbfe629c66d1f20b8306baf322ece450d68db7",
    destinationTx: "0x4525519e37430ff5d473b3e7af2f41e66070bf4522cad9c1d5df0dba6a47b287",
  },
  {
    id: "uniswap",
    protocol: "Uniswap v4 ETH/USDC",
    position: "Position 7920",
    route: "cctp",
    sourceDomain: 6,
    sourceName: "Base Sepolia",
    destinationDomain: 10,
    destinationName: "Unichain Sepolia",
    destinationId: "uniswap-v4-eth-usdc-unichain-sepolia",
    amount: "1 USDC",
    seconds: 31,
    sourceTx: "0x082440c3cda81259ab7f8e636e2dc0ea5292f510655f05619dc2b251a2f238a8",
    arcMintTx: "0x6f08191e89260315621a6d0d256663381749cc730bf360a591200bba462ed2d8",
    sweepTx: "0x1cf9832b4151ad0886029b45ea349b66b82699793373fc00c3f87591fe17ab09",
    destinationTx: "0x9bfe59be1f352251d7f879f263ca7265634c707b1c5b11c336f89491228ca769",
  },
  {
    id: "euler",
    protocol: "Euler",
    position: "999867 eUSDC-4 shares",
    route: "cctp",
    sourceDomain: 3,
    sourceName: "Arbitrum Sepolia",
    destinationDomain: 0,
    destinationName: "Ethereum Sepolia",
    destinationId: "euler-ethereum-sepolia",
    amount: "1 USDC",
    seconds: 42,
    sourceTx: "0x859bd749b3544f2f527a9faf6eea70ff9fa1ab050f203e72215f136d636f9764",
    arcMintTx: "0xdefd3b86332166163a662819c91bbf3c60f5dc706bab706b17dcd1f6c811ac43",
    sweepTx: "0xb5e237eb8a0aed5e7bd7cd7dcfa1b418a1f1668fd339787ededbdda670be3d05",
    destinationTx: "0xdce4061d197ce895913138c36dda5ff73e11a0fde6d24dc147b5b2f2492c9e78",
  },
  {
    id: "monad",
    protocol: "Inlet demo vault",
    position: "999870 vault shares",
    route: "cctp",
    sourceDomain: 3,
    sourceName: "Arbitrum Sepolia",
    destinationDomain: 15,
    destinationName: "Monad Testnet",
    destinationId: "demo-vault-monad-testnet",
    amount: "1 USDC",
    seconds: 37,
    sourceTx: "0x906aa61c1dcb4d6bf2a0c86d17ba8921e1ba29dbf78883ffe108adb85893ce4d",
    arcMintTx: "0xf6e4719ad1a98b0a030cfbe2cc16de026197acd43a8d5e03d41e1c9df21c2ab7",
    sweepTx: "0x6d53e95e78b356f35893d997fe7de139e963c370195b29600b9b8bdc0bc3d613",
    destinationTx: "0x736aa9690101dca120f8adde22baea9066ff9306d152d1cecf7445b758f1753f",
  },
  {
    id: "agent",
    protocol: "Compound III",
    position: "USDC supplied by an agent",
    route: "gateway",
    sourceDomain: 6,
    sourceName: "Base Sepolia Gateway balance",
    destinationDomain: 6,
    destinationName: "Base Sepolia",
    destinationId: "compound-v3-base-sepolia",
    amount: "1 USDC",
    seconds: 16,
    arcMintTx: "0x2180a82f73e121449b52f616883ffa71a26c44b66eaee012edad9887f37e1a31",
    sweepTx: "0x113d8d04186c5082eb9c54dbbd87b92a733d8db03d13ecbaa0c9b6f864fe80c1",
    destinationTx: "0xdcf11694a8160eec3413e20302a36cbb50a40ff93b7bbcc8508fcf44106e7cad",
    note: "One deposit tool call over MCP against the hosted relayer",
  },
  {
    id: "privy",
    protocol: "Inlet demo vault",
    position: "4999350 vault shares",
    route: "cctp",
    sourceDomain: 6,
    sourceName: "Base Sepolia",
    destinationDomain: 3,
    destinationName: "Arbitrum Sepolia",
    destinationId: "demo-vault",
    amount: "5 USDC",
    seconds: 30,
    sourceTx: "0xbaacde1567f93babee0b2295c56a8a8cbf95243824d78eead4c199aa93922905",
    arcMintTx: "0x20092205fb9d084da2885b0d078a6e88e6f55414972fa853f171420995ca100d",
    sweepTx: "0x71c3d75c0b74d5690ee3cfb18ab93cf9e1d7d329f41e3d8a9e11dba5c243edc4",
    destinationTx: "0x01327610d541bfd4381d8d087bf0aab318c5e38e9653a37a04f0284df57cc3d5",
    note: "Signed from a Privy email wallet inside the widget",
  },
];
