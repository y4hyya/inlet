# Inlet on mainnet: readiness and order of operations

Written 2026-09-10, revised 2026-09-11 for the exit rail. Companion to the scripts in `contracts/script` and to `config/chains.mainnet.json` and `config/deployments.mainnet.json`.

This document answers Arc Prize 4, "Launch on Arc Testnet and Push to Mainnet", which asks for a working Arc integration that is ready to ship. The bar is deployment by 2026-09-30. Arc mainnet itself launches 2026-09-16, so nothing here can be executed before that date, and everything here is written so that it can be executed in one sitting once it is.

Nothing in this plan changes the contracts. The same five Foundry scripts that produced the testnet deployment produce the mainnet one, driven entirely by environment variables: `DeployHub`, `DeployReceiver`, `DeployAdapter`, `ConfigureHub` and `DeployExit`.

---

## 1. What is already true

The testnet deployment is not a prototype of the mainnet one. It is the same code with different addresses.

| Piece | Why it carries over unchanged |
|---|---|
| `InletHub` | Chain agnostic. Takes USDC, the TokenMessenger and its own CCTP domain as constructor arguments and routes by destination domain from its registry. |
| `InletReceiver` | Takes USDC, the MessageTransmitter, the hub domain and the hub address as constructor arguments. No hardcoded network. |
| Adapters | ERC 4626, Aave V3, Compound III and Uniswap v4 take their protocol addresses as constructor arguments. |
| `InletExit` and the exit adapters | Take USDC and the TokenMessenger as constructor arguments. Every executor address derives from the intent hash and the `InletExit` that creates it, so nothing in the exit rail is chain specific either. |
| Relayer | Every chain it serves, receivers and exit rails alike, comes from `config/deployments.*.json` and an RPC environment variable. Adding mainnet is configuration, not code. |
| SDK and widget | Read the same generated catalog. A mainnet catalog entry is a data change. |

The one genuine gap is the receiver address. On testnet the receivers were deployed with ordinary `CREATE`, so their addresses are a function of the deployer's nonce on each chain. Four chains happen to share `0x84f3...408B` because the receiver was that key's first transaction there. Base differs because it went out at nonce 10. Mainnet should not inherit that accident.

---

## 2. Deterministic addresses

Deploy every receiver, adapter and `InletExit` through the standard deterministic deployment proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C`, which is present on Ethereum, Arbitrum One, Base and Unichain. Foundry uses it automatically when a script passes a salt. Whether the proxy exists on Arc mainnet at launch is not known; the hub is a single contract, so it can go out with plain `CREATE` from a fresh nonce without losing anything.

The change is one line per deployment in the scripts, from

```solidity
new InletReceiver(usdc, messageTransmitter, hubDomain, hub, owner)
```

to

```solidity
new InletReceiver{salt: SALT}(usdc, messageTransmitter, hubDomain, hub, owner)
```

with `SALT` read from the environment so a redeploy can be forced without changing code. Because the constructor arguments differ per chain, the addresses will still differ unless the arguments are made identical. Two options:

- **Accept per chain addresses, gain reproducibility.** Same code plus same salt plus same arguments gives the same address on any chain, so a redeploy of the same chain is idempotent and verifiable by anyone.
- **One address everywhere.** Move USDC and the MessageTransmitter out of the constructor and into an `initialize` call guarded by the deployer. Then the creation code is identical on every chain and one address covers all of them. This is a contract change and needs a fresh test pass.

Recommendation: take the first for the September 30 bar, and note the second as the follow up. The prize asks for a working integration ready to ship, not for a cosmetic address match, and a contract change three weeks after the audit surface was frozen is the larger risk.

---

## 3. Addresses to deploy against

Confirmed from Circle's documentation on 2026-09-10.

### Circle contracts, identical on every EVM mainnet

| Contract | Address |
|---|---|
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` |

### USDC and CCTP domains

| Chain | Chain id | CCTP domain | USDC |
|---|---|---|---|
| Ethereum | 1 | 0 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Arbitrum One | 42161 | 3 | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |
| Base | 8453 | 6 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Unichain | 130 | 10 | `0x078D782b760474a361dDA0AF3839290b0EF57AD6` |
| Arc | pending | 26 | pending |

Arc mainnet is not yet in Circle's published tables, because it has not launched. Its chain id, its USDC address and whether USDC keeps the predeploy address it has on testnet (`0x3600...0000`) all have to be read from Circle's documentation on launch day. The CCTP domain is expected to stay 26, matching testnet, but confirm it by calling `localDomain()` on the MessageTransmitter exactly as we did to confirm Monad was 15.

### Gateway

Circle Gateway is a separate product from CCTP and ships chain by chain. On mainnet Circle lists it as live on Ethereum, Arbitrum One, Base and Unichain, and lists Arc as testnet only; the mainnet wallet and minter addresses go into `config/chains.mainnet.json` from Circle's contract address page when the Gateway route is switched on. The Gateway route needs the minter on Arc, so treat it as absent on mainnet Arc until it appears on Circle's supported list. Inlet does not need it: the CCTP route is the complete path and the Gateway route is an optimisation that removes gas and the network switch. Monad already runs as a CCTP only destination on testnet, so the code path is proven.

---

## 4. Order of operations

Every step is a command that already exists. Nothing below is new tooling.

**Before the 16th.** Fund the deployer key `0x31b1610Ec633Ed09Ce15dfDf697DD631daa3Bd02` with native gas on Ethereum, Arbitrum One, Base and Unichain. Ethereum is the expensive one and should be budgeted separately. Decide whether the mainnet owner stays this key or moves to a multisig before any value flows; the receiver takes an `OWNER` argument, so this is a deployment time decision, not a migration.

**Day one, after Arc mainnet is live.**

1. Read Arc mainnet's chain id, USDC address and CCTP contracts from Circle's documentation. Confirm the domain by calling `localDomain()`.
2. Fill the pending fields in `chains.mainnet.json`.
3. Fund the deployer on Arc.
4. Deploy the hub with `DeployHub.s.sol` against Arc mainnet, with `USDC`, `TOKEN_MESSENGER`, `LOCAL_DOMAIN`, `OWNER` and `PRIVATE_KEY` set.
5. Record the hub address in `deployments.mainnet.json`.

**Day two, the destination chains.** For each of Ethereum, Arbitrum One, Base and Unichain, in that order of increasing appetite:

1. `DeployReceiver.s.sol` with `USDC`, `MESSAGE_TRANSMITTER`, `HUB`, `HUB_DOMAIN`, `OWNER`, `PRIVATE_KEY` and `DEPLOY_DEMO_VAULT=false`.
2. `DeployAdapter.s.sol` for the adapters that chain carries. Aave V3 on Arbitrum, Compound III on Base, Uniswap v4 on Unichain with `POSITION_MANAGER`, `STATE_VIEW`, `PERMIT2` and `USDC`, ERC 4626 everywhere.
3. `DeployExit.s.sol` with `USDC`, `TOKEN_MESSENGER`, `OWNER` and `PRIVATE_KEY`. It deploys the `InletExit` and the three exit adapters and registers them, so a withdrawal out of Aave on Arbitrum One, Compound on Base or any EIP 2612 vault works the day the position exists.
4. `ConfigureHub.s.sol` on Arc with `HUB`, `DOMAIN`, `KIND=1`, `RECEIVER` as bytes32 and `MAX_FEE_BPS`.
5. Record every address in `deployments.mainnet.json`.

**Day three, the services.**

1. Add `ARC_MAINNET_RPC`, `ETHEREUM_RPC`, `ARBITRUM_RPC`, `BASE_RPC` and `UNICHAIN_RPC` to the relayer environment. Use paid endpoints. Every public RPC lesson from testnet applies harder on mainnet: stale nonces, lagging reads, and burns that need explicit gas.
2. Fund the relayer key with native gas on all four destination chains, which also pays for exit executions and leg mints, and USDC on Arc for the sweep step.
3. Point a second relayer deployment at the mainnet config rather than switching the testnet one, so the demo keeps working.
4. Add the mainnet destinations to the SDK catalog, with their exit entries, and regenerate.
5. Prove it with one end to end run of a single USDC into the ERC 4626 destination on the cheapest chain, then one into Aave, then one withdrawal back out. Record the hashes the same way the testnet runs are recorded.

---

## 5. What changes in the repository

Small and all additive.

| File | Change |
|---|---|
| `config/chains.mainnet.json` | In the repository. The PENDING values fill on launch day. |
| `config/deployments.mainnet.json` | In the repository. Every address fills as the scripts run. |
| `contracts/script/*.s.sol` | Add a `SALT` environment variable and pass it to each `new`. |
| `services/relayer/src/chains.ts` | Add the four mainnet viem chains alongside the testnet ones. |
| `services/relayer/src/config.ts` | Add the mainnet RPC variables. |
| `packages/sdk/src/destinations.ts` | Add mainnet destination specs, their exit entries and mainnet explorers. |
| `UI/app/docs/addresses/page.mdx` | A mainnet table beside the testnet one. |

---

## 6. Risks, and what each one costs

| Risk | Cost if it happens | Mitigation |
|---|---|---|
| Arc mainnet slips past September 16 | The whole schedule slips, and the September 30 bar tightens | Everything except the Arc steps can be done first. Receivers on the four destination chains do not need the hub to exist, only its address, and the hub address can be computed from the deployer and nonce before it is deployed. |
| Arc mainnet USDC is not at the testnet predeploy address | One config value, caught immediately | Read it, do not assume it. |
| Gateway is not on Arc mainnet at launch | Nothing. CCTP is the complete path. | Ship CCTP only, add Gateway when it lands. |
| Ethereum gas makes a live demo expensive | A demo run costs real money | Demo on Base or Arbitrum. Ethereum is there to prove reach, not to be the demo chain. |
| A public RPC returns a stale nonce mid deploy | A failed transaction and a confused nonce | Paid RPCs, and the local nonce management the relayer already does. |
| The deterministic deployment proxy is not on Arc mainnet | The hub address is not reproducible from a salt | Deploy the hub with plain `CREATE`. There is one hub, and its address is recorded in the config either way. |

---

## 7. The honest summary for the submission

Inlet's mainnet path is configuration, not construction. The hub, the receivers, the four adapters, the exit rail and its three exit adapters are chain agnostic by design and take every network specific value as a constructor argument. The relayer derives its chains from a config file. Five testnet chains already prove the pattern generalises, one of them CCTP only, which is exactly the shape Arc mainnet will have if Gateway has not shipped there yet.

What remains is deploying against published mainnet addresses, funding two keys, and one end to end run per destination. The single deliberate change is deterministic deployment through the standard proxy so that every mainnet address is reproducible by anyone with the repository.
