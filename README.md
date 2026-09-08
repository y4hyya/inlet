# Inlet

From any chain into any position.

[![contracts](https://github.com/y4hyya/inlet/actions/workflows/contracts.yml/badge.svg)](https://github.com/y4hyya/inlet/actions/workflows/contracts.yml)

Inlet is a deposit rail for DeFi. A user holding USDC on any supported chain signs once and, about half a minute later, holds the position they asked for on the chain the protocol lives on: an Aave supply, a Compound balance, a vault share, a Uniswap v4 liquidity position. Not USDC sitting in a wallet on the other side. The position itself.

Circle Gateway or CCTP V2 brings native USDC to Arc, the Inlet hub on Arc escrows it and routes it through CCTP to the destination chain, and an adapter makes the protocol call for the user. If that call cannot complete, the USDC stays claimable by the user. Nothing is wrapped and nothing gets stuck.

## Live on testnet

| | |
| --- | --- |
| Site | https://inletkit.vercel.app |
| Live app | https://inletkit.vercel.app/app |
| Docs | https://inletkit.vercel.app/docs |
| Relayer API | https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io |
| Hub on Arc testnet | [0x84f3433550d1B6FB7f0BE197eA9faA256962408B](https://testnet.arcscan.app/address/0x84f3433550d1B6FB7f0BE197eA9faA256962408B) |

Log in with an email through Privy or connect a wallet, pick a destination, enter an amount, and watch the timeline fill. The Gateway route needs a unified balance on the source chain and no gas. The CCTP route needs USDC and a little ETH there.

## How it works

![How a deposit moves through Inlet](diagram/architecture.png?v=2)

1. The widget registers a deposit intent with the relayer and gets back a deposit address on Arc, derived from the hash of every parameter of the deposit.
2. The user funds that address in one action: a signed Gateway burn intent paid from their unified balance, or a CCTP burn from their wallet.
3. Anyone can call `sweep` on the hub. It pulls the USDC from the deposit address and burns it through CCTP toward the destination chain, with the intent in the hook data.
4. Circle attests the burn. The relayer submits the mint on the destination chain and calls the receiver with the same message.
5. The receiver checks that Circle minted the message, then calls the adapter, which makes the protocol deposit in the user's name.
6. After the deadline anyone can call `refund`, and the USDC goes back to the wallet it came from. If the adapter call fails, the USDC waits in the receiver for the user to claim.

<table>
<tr>
<td align="center"><a href="diagram/deposit-sequence.png"><img src="diagram/deposit-sequence.png?v=2" width="300" alt="One deposit, end to end"></a><br><sub>One deposit, end to end</sub></td>
<td align="center"><a href="diagram/intent-lifecycle.png"><img src="diagram/intent-lifecycle.png?v=2" width="300" alt="Intent lifecycle"></a><br><sub>Intent lifecycle</sub></td>
<td align="center"><a href="diagram/deployment.png"><img src="diagram/deployment.png?v=2" width="300" alt="Where Inlet runs on testnet"></a><br><sub>Where Inlet runs on testnet</sub></td>
</tr>
</table>

The diagrams live in [`diagram/`](diagram/) as HTML, SVG and PNG. [`docs/spec.md`](docs/spec.md) is the full specification.

## Why nothing gets stuck

- The deposit address is the commitment. USDC only arrives there because the user named that address in the transfer they signed, so Inlet never needs a signature of its own.
- The hub can only move USDC along the path the intent names, or back to the intent's refund address after the deadline.
- The receiver only executes the adapter the intent names, for the beneficiary the intent names, with the amount Circle minted, and only for burns that came from the hub.
- Sweep, refund, receive and claim are permissionless. A relayer can delay a deposit. It cannot redirect one, and it is not needed to finish one.
- Version one charges nothing. The intent carries a fee field and the hub rejects any value other than zero.

## Destinations live on testnet

| Destination | Chain | Adapter | Position | Recorded deposit |
| --- | --- | --- | --- | --- |
| Aave V3 | Arbitrum Sepolia | `aave-v3:v1` | [aArbSepUSDC](https://sepolia.arbiscan.io/token/0x460b97BD498E1157530AEb3086301d5225b91216) | [execute](https://sepolia.arbiscan.io/tx/0x871b4f1539a91b6196c346d8561f14ad088760f93c823a9cce8ef59a609d5170), 42 seconds from the burn on Base Sepolia |
| Compound III | Base Sepolia | `compound-v3:v1` | [USDC supply balance](https://sepolia.basescan.org/address/0x571621Ce60Cebb0c1D442B5afb38B1663C6Bf017) | [execute](https://sepolia.basescan.org/tx/0xaa8701105bab942c3bb64615e68ce9858728488cab5c291f37283bda1e7436f4), 32 seconds from the burn on Arbitrum Sepolia |
| Morpho Oneshot vault | Base Sepolia | `erc4626:v1` | [vUSDC shares](https://sepolia.basescan.org/token/0x405baeEC864f9fa12aB031e69F2a1aA2E4Add240) | [execute](https://sepolia.basescan.org/tx/0x4525519e37430ff5d473b3e7af2f41e66070bf4522cad9c1d5df0dba6a47b287), 36 seconds from the burn on Arbitrum Sepolia |
| Uniswap v4 ETH/USDC | Unichain Sepolia | `uniswap-v4-lp:v1` | [position 7920](https://sepolia.uniscan.xyz/token/0xf969Aee60879C54bAAed9F3eD26147Db216Fd664?a=7920) | [execute](https://sepolia.uniscan.xyz/tx/0x9bfe59be1f352251d7f879f263ca7265634c707b1c5b11c336f89491228ca769), 31 seconds from the burn on Base Sepolia |
| Inlet demo vault | Arbitrum Sepolia | `erc4626:v1` | [vault shares](https://sepolia.arbiscan.io/token/0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED) | [execute](https://sepolia.arbiscan.io/tx/0x01327610d541bfd4381d8d087bf0aab318c5e38e9653a37a04f0284df57cc3d5), 5 USDC from a Privy email wallet in the widget |

On the hosted stack a Gateway deposit takes about twenty seconds, a CCTP deposit thirty to forty five, and a deposit driven by the MCP server sixteen. Every run with all of its transaction hashes is in [`services/relayer/README.md`](services/relayer/README.md).

## Integrate in three lines

```
npm install @inletkit/widget @inletkit/sdk
```

```tsx
import { InletProvider, DepositWidget, erc4626Destination } from "@inletkit/widget";
import "@inletkit/widget/styles.css";

const vault = erc4626Destination({
  id: "my-vault",
  name: "My USDC Vault",
  destinationDomain: 6,
  receiver: "0x643AD7be131Aa7eE9fADB1596A66E69715F5a594",
  vault: "0xYourVaultOnBaseSepolia",
});

<InletProvider privyAppId={PRIVY_APP_ID} relayerUrl={RELAYER_URL}>
  <DepositWidget destinations={[vault]} />
</InletProvider>
```

Any ERC 4626 vault over USDC on a chain with a receiver needs no contract work. Anything else needs one adapter with one function. [`docs/adapters.md`](docs/adapters.md) walks through writing, testing and deploying one, and lists the receivers and adapters deployed on each chain. The relayer is open source and anyone can run one against the same hub, see [`services/relayer/README.md`](services/relayer/README.md).

## For agents

[`apps/mcp`](apps/mcp) is a stdio MCP server over the same SDK and relayer API the widget uses. Tools: `list_destinations`, `list_sources`, `quote_deposit`, `create_intent` (returns the deposit address and the exact transaction or EIP 712 payload to sign), `report_source_transaction`, `submit_gateway_intent`, `deposit_status`, `uniswap_quote`, and, when `INLET_PRIVATE_KEY` is set, `deposit` and `fund_gateway_balance`, which run the whole flow with that wallet.

```json
{
  "mcpServers": {
    "inlet": {
      "command": "node",
      "args": ["/path/to/inlet/apps/mcp/dist/index.js"],
      "env": { "INLET_RELAYER_URL": "https://inlet-relayer.wonderfulforest-6c3e22a4.westeurope.azurecontainerapps.io" }
    }
  }
}
```

[`skills/inlet/SKILL.md`](skills/inlet/SKILL.md) teaches a coding agent how to mount the widget, write an adapter, and run a relayer.

Recorded agent run: one `deposit` tool call moved 1 USDC from a Base Sepolia Gateway balance into Compound III in sixteen seconds: [mint on Arc](https://testnet.arcscan.app/tx/0x2180a82f73e121449b52f616883ffa71a26c44b66eaee012edad9887f37e1a31), [sweep](https://testnet.arcscan.app/tx/0x113d8d04186c5082eb9c54dbbd87b92a733d8db03d13ecbaa0c9b6f864fe80c1), [execute on Base Sepolia](https://sepolia.basescan.org/tx/0xdcf11694a8160eec3413e20302a36cbb50a40ff93b7bbcc8508fcf44106e7cad).

## Uniswap integration

Inlet delivers Uniswap v4 liquidity positions on Unichain Sepolia (chain id 1301). A deposit of USDC from any chain ends as a position NFT owned by the depositor in the ETH/USDC pool (fee 3000, tick spacing 60, no hooks), minted with a USDC only range just below the current price so no ETH is needed. Developer feedback for the Uniswap Foundation is in [`FEEDBACK.md`](FEEDBACK.md).

Contracts on Unichain Sepolia:

| Contract | Address |
| --- | --- |
| Inlet receiver | [0x84f3433550d1B6FB7f0BE197eA9faA256962408B](https://sepolia.uniscan.xyz/address/0x84f3433550d1B6FB7f0BE197eA9faA256962408B) |
| Uniswap v4 liquidity adapter | [0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED](https://sepolia.uniscan.xyz/address/0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED) |
| Uniswap PositionManager | 0xf969Aee60879C54bAAed9F3eD26147Db216Fd664 |
| Uniswap StateView | 0xc199F1072a74D4e905ABa1A84d9a45E2546B6222 |
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 |

Where the integration lives:

- [`contracts/src/adapters/UniswapV4LpAdapter.sol`](contracts/src/adapters/UniswapV4LpAdapter.sol): the constructor approves Permit2 and the PositionManager (lines 39 to 45), `plan` reads the current tick from StateView and sizes a single sided range (lines 71 to 88), `_mint` encodes `MINT_POSITION` and `SETTLE_PAIR` and calls `modifyLiquidities` (lines 90 to 106), `range` and `floorTick` handle tick spacing and negative tick rounding (lines 109 to 134).
- [`contracts/src/libraries/LiquidityMath.sol`](contracts/src/libraries/LiquidityMath.sol): liquidity for a single sided amount, mirroring Uniswap's `LiquidityAmounts`.
- [`contracts/src/interfaces/IUniswapV4.sol`](contracts/src/interfaces/IUniswapV4.sol): the PositionManager, StateView and Permit2 surface used. `TickMath`, `PoolKey`, `PoolId` and `Currency` come from the `v4-core` submodule.
- [`contracts/test/fork/UniswapV4Fork.t.sol`](contracts/test/fork/UniswapV4Fork.t.sol) mints a real position on a fork of Unichain Sepolia. [`contracts/test/adapters/UniswapV4LpAdapter.t.sol`](contracts/test/adapters/UniswapV4LpAdapter.t.sol) covers action encoding, tick alignment, Permit2 approvals and the claimable fallback.
- [`packages/sdk/src/intent.ts`](packages/sdk/src/intent.ts): `uniswapV4LpAdapterData` and `poolId` (lines 88 to 94).
- [`services/relayer/src/uniswap.ts`](services/relayer/src/uniswap.ts): the Uniswap Trading API `/quote` client behind the relayer's `/quotes/uniswap` route, shown as the live pool price in the widget.

Recorded deposit: [burn on Base Sepolia](https://sepolia.basescan.org/tx/0x082440c3cda81259ab7f8e636e2dc0ea5292f510655f05619dc2b251a2f238a8), [mint on Arc](https://testnet.arcscan.app/tx/0x6f08191e89260315621a6d0d256663381749cc730bf360a591200bba462ed2d8), [sweep on Arc](https://testnet.arcscan.app/tx/0x1cf9832b4151ad0886029b45ea349b66b82699793373fc00c3f87591fe17ab09), [execute on Unichain Sepolia](https://sepolia.uniscan.xyz/tx/0x9bfe59be1f352251d7f879f263ca7265634c707b1c5b11c336f89491228ca769), [position 7920](https://sepolia.uniscan.xyz/token/0xf969Aee60879C54bAAed9F3eD26147Db216Fd664?a=7920) with liquidity 546255824825 owned by the depositor.

## Built with

- Circle: Gateway for unified balances and one signature deposits, CCTP V2 with hook data for every hop between chains, Arc testnet as the settlement hub, Iris for attestations.
- Privy for email login and embedded wallets, wagmi and viem for everything the browser does on chain.
- Uniswap v4 on Unichain Sepolia, Aave V3 on Arbitrum Sepolia, Compound III and the Morpho Oneshot vault on Base Sepolia.
- Foundry and OpenZeppelin for the contracts, Fastify and SQLite for the relayer, Next.js for the site, the Model Context Protocol SDK for the agent server, Azure Container Apps for the relayer and Vercel for the site.

## Repository layout

- `contracts/` the hub on Arc, per intent forwarders, the EVM receiver, and the adapters for ERC 4626 vaults, Aave V3, Compound III and Uniswap v4 (Foundry)
- `packages/sdk` intents, adapter data encoders, the destination catalog, Gateway and CCTP helpers, the relayer client
- `packages/widget` the React deposit widget with optional Privy login
- `services/relayer` deposit tracking, Arc mints, sweeps, attestations, destination execution, refunds, and the Uniswap quote proxy
- `UI` the site: landing page, live app with replay of recorded runs, and docs
- `apps/mcp` the MCP server for agents
- `skills/inlet` the agent skill for integrating the kit
- `config/` chain, deployment and protocol addresses, generated into the SDK
- `diagram/` the four diagrams and the scripts that build them
- `docs/` the specification and the adapter guide
- `infra/` Bicep for the Azure resources

## Develop

```
pnpm install
pnpm -r build
cd contracts && forge test                    # 43 tests; the fork tests run when the RPC variables are set
pnpm --filter @inletkit/sdk test              # hashing parity with the deployed hub
pnpm --filter @inletkit/widget test           # route planning across chains
pnpm --filter @inletkit/relayer dev           # local relayer on port 8787
pnpm --filter @inletkit/ui dev                # http://localhost:3000
DESTINATION=aave pnpm --filter @inletkit/relayer e2e   # one real deposit; also compound, morpho, uniswap
```

Three env files, each with an `.env.example` next to it: `contracts/.env` holds the deployer key, `services/relayer/.env` the relayer key, the RPC URLs and an optional Uniswap API key, `apps/playground/.env.local` the Privy app id and the relayer URL. Hosting is described in [`infra/README.md`](infra/README.md).

## Status

Built during ETHGlobal ETHOnline 2026 on Arc testnet. Zero fees. Not audited. Testnet only.

## License

MIT
