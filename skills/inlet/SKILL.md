---
name: inlet
description: Add cross chain USDC deposits and withdrawals to a DeFi protocol with Inlet. Use when a user wants deposits from any chain into a vault, market, or pool, wants positions withdrawn back to USDC on any chain, wants to write an Inlet adapter, or wants to mount the Inlet widget or run the relayer.
---

# Inlet

Inlet delivers native USDC from any chain a user holds it on into a position on the chain a protocol runs on. The user signs once on the source chain; Circle Gateway or CCTP V2 brings the USDC to a per deposit address on Arc, the Inlet hub sweeps it through CCTP to the destination, and the Inlet receiver calls an adapter that makes the protocol deposit for the user. If the adapter call fails the USDC stays claimable by the user. Zero fees, no wrapped tokens, testnet only for now.

Repository: https://github.com/y4hyya/inlet. Live site: https://inletkit.vercel.app, with the app at /app and the docs at /docs. Relayer API: https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io.

## Decide what the protocol needs

- An ERC 4626 vault over USDC on Arbitrum Sepolia, Base Sepolia, Unichain Sepolia, Ethereum Sepolia or Monad Testnet: no contract work. Use `erc4626Destination` with the vault address and the receiver for that chain.
- Aave V3, Compound III or a Uniswap v4 pool with USDC on one side: presets exist, see `packages/widget/src/config.ts`.
- Anything else on those chains: write an adapter, see below.
- A chain without a receiver: deploy `InletReceiver` and the generic adapter there with `contracts/script/DeployReceiver.s.sol`, then ask the hub owner to register the CCTP domain and the receiver with `contracts/script/ConfigureHub.s.sol`.

## Mount the widget

```
pnpm add @inletkit/widget @inletkit/sdk
```

```tsx
import { InletProvider, InletWidget, erc4626Destination } from "@inletkit/widget";
import "@inletkit/widget/styles.css";

const vault = erc4626Destination({
  id: "my-vault",
  name: "My USDC Vault",
  destinationDomain: 6,
  receiver: "0x643AD7be131Aa7eE9fADB1596A66E69715F5a594",
  vault: "0xYourVaultOnBaseSepolia",
});

<InletProvider privyAppId={PRIVY_APP_ID} relayerUrl={RELAYER_URL}>
  <InletWidget destinations={[vault]} />
</InletProvider>
```

`InletWidget` is deposit and withdraw under one header. `DepositWidget` and `ExitWidget` are the two halves on their own. `InletProvider` brings Privy login and wagmi. An app that already runs wagmi renders the widget inside its own provider and skips `InletProvider`; the widget only uses wagmi hooks and the `relayerUrl` prop. A vault that implements EIP 2612 becomes withdrawable by passing `exitContract`, the InletExit on its chain, to `erc4626Destination`.

## Deposit without a browser

Use `@inletkit/sdk` and the relayer API. The flow is the same one the widget runs:

1. Build a `DepositIntent`: owner, sourceDomain, destinationDomain, adapterId, receiver (bytes32), beneficiary (bytes32), adapterData, amount (a floor in USDC units), nonce, deadline, refundRecipient, feeBps 0.
2. `POST /intents` with the intent and the route (`cctp` or `gateway`). The reply carries the intent hash and the deposit address on Arc.
3. CCTP route: approve Circle's TokenMessengerV2 on the source chain and call `depositForBurn(amount, 26, depositAddress, usdc, 0x0, maxFee, 1000)`; then `POST /intents/:hash/source-tx`. The intent amount must be the burned amount minus the fast transfer fee (`IrisClient.fastTransferMaxFee`).
4. Gateway route: sign a Gateway burn intent (`createBurnIntent` and `burnIntentTypedData`) whose recipient is the deposit address, then `POST /intents/:hash/gateway`. No gas needed.
5. Poll `GET /intents/:hash` until the state is `executed` (or `claimable`, `refunded`, `expired`).

The MCP server in `apps/mcp` wraps these steps as tools for agents: `list_destinations`, `quote_deposit`, `create_intent`, `report_source_transaction`, `submit_gateway_intent`, `deposit_status`, `uniswap_quote`, and for the way out `list_withdrawable`, `create_exit`, `submit_exit`, `exit_status`. Signing stays with the agent's own wallet.

## Withdraw without a browser

The exit rail is the deposit in reverse. One signature on the position token, and the position becomes native USDC on one or more chains.

1. Pick a destination with an `exit` entry from `exitableDestinations` in `@inletkit/sdk`: Aave V3 on Arbitrum Sepolia, the Morpho vault and Compound III on Base Sepolia.
2. Build an `ExitIntent`: owner, `exit.adapterId`, `exit.adapterData`, amount in position units (vault shares from `previewWithdraw`, otherwise the USDC amount), minAssets, legs as `(domain, recipient bytes32, amount)` where the last leg's amount is 0 and takes the rest, nonce, deadline, maxFeeBps from `maxFeeBpsFor(IrisClient.getBurnFees(positionDomain, legDomain))`.
3. Read `hashExit(intent)` and `exitAddress(hash)` on the InletExit of the position's chain (`hashExit` in the SDK gives the same value).
4. Sign for that executor: `permitTypedData` with the executor as spender for Aave aTokens and vault shares, `cometAuthorizationTypedData` with the executor as manager for Compound. The nonce and the domain name come from the token. No gas.
5. `POST /exits` with the intent and the signature, then poll `GET /exits/:hash` through `signed`, `executed`, `attested` and `delivered`, which carries a mint transaction per leg.

`services/relayer/scripts/e2e-exit.ts` is the runnable version. Legs land on any chain the relayer serves, Arc included, except the position's own chain.

## Write an adapter

```solidity
contract MyAdapter is IInletAdapter {
    function deposit(address usdc, uint256 amount, bytes32 beneficiary, bytes calldata data)
        external
        returns (bytes memory)
    {
        (address market, uint256 minOut) = abi.decode(data, (address, uint256));
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(usdc).forceApprove(market, amount);
        uint256 out = IMarket(market).depositFor(address(uint160(uint256(beneficiary))), amount);
        if (out < minOut) revert TooLittle(out, minOut);
        return abi.encode(out);
    }
}
```

Rules: verify anything in `data` that could redirect funds, pull exactly `amount`, give the position to the beneficiary, enforce a minimum, and let reverts happen (the receiver turns them into claimable USDC). Test through `InletReceiver.receiveAndExecute` with a mock and with a fork test. Deploy and register with `NAME=my-adapter RECEIVER=<receiver> forge script script/DeployAdapter.s.sol --rpc-url <rpc> --broadcast` after adding the name to that script. Full guide: `docs/adapters.md`.

## Run a relayer

```
cd services/relayer
cp .env.example .env   # RELAYER_PRIVATE_KEY funded with USDC on Arc and ETH on the destination chains
pnpm dev
```

Everything the relayer does is permissionless: `sweep` and `refund` on the hub, `receiveMessage` on Circle's MessageTransmitter, `execute` and `claim` on the receiver. A protocol can run its own relayer or point the widget at the hosted one.

## Addresses on testnet

| Item | Value |
| --- | --- |
| Hub on Arc testnet, chain 5042002, CCTP and Gateway domain 26 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B |
| Receiver on Arbitrum Sepolia, domain 3 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B |
| Receiver on Base Sepolia, domain 6 | 0x643AD7be131Aa7eE9fADB1596A66E69715F5a594 |
| Receiver on Unichain Sepolia, domain 10 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B |
| Receiver on Ethereum Sepolia, domain 0 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B |
| Receiver on Monad Testnet, domain 15 | 0x84f3433550d1B6FB7f0BE197eA9faA256962408B |
| InletExit on Arbitrum Sepolia | 0xBBA8b8f139e27101812340fc750e39f096ECD677 |
| InletExit on Base Sepolia | 0xfa6000e83B141bDA1aD067a5a5A32912f43F0258 |
| Adapter ids | `erc4626:v1`, `aave-v3:v1`, `compound-v3:v1`, `uniswap-v4-lp:v1` |
| Exit adapter ids | `erc4626-exit:v1`, `aave-v3-exit:v1`, `compound-v3-exit:v1` |
| Circle | TokenMessengerV2 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA, MessageTransmitterV2 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275, GatewayWallet 0x0077777d7EBA4688BDeF3E311b846F25870A19B9, GatewayMinter 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B on every EVM testnet |

Every other address is in `config/chains.testnet.json`, `config/deployments.testnet.json` and `config/protocols.testnet.json`, exported by the SDK as `testnetChains`, `testnetDeployments` and `testnetProtocols`.
