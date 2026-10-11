# Inlet on mainnet

Written 2026-09-10 as the readiness plan for Arc Prize 4, rewritten 2026-10-12 after the deployment ran. Companion to the scripts in `contracts/script` and to `config/chains.mainnet.json`, `config/deployments.mainnet.json` and `config/protocols.mainnet.json`.

Nothing in the mainnet push changed the contracts. The same five Foundry scripts that produced the testnet deployment produced the mainnet one, driven by environment variables: `DeployHub`, `DeployReceiver`, `DeployAdapter`, `DeployExit` and `ConfigureHub`.

---

## 1. What is live

Arc mainnet carries the hub. Arbitrum One is the first destination, with the Aave V3 adapter, the ERC 4626 adapter and the exit rail. Every contract is owned by the deployer key `0x31b1610Ec633Ed09Ce15dfDf697DD631daa3Bd02`.

| Contract | Chain | Address | Deployment |
|---|---|---|---|
| InletHub | Arc mainnet, chain 5042, domain 26 | `0x84f3433550d1B6FB7f0BE197eA9faA256962408B` | [0x9a2e1d67…](https://explorer.arc.io/tx/0x9a2e1d678fc3d7dcb642c0eed645f994c118892986873b1e84a1ff8ec7e6ffc8) |
| InletReceiver | Arbitrum One, chain 42161, domain 3 | `0x84f3433550d1B6FB7f0BE197eA9faA256962408B` | [0x4e6e72c1…](https://arbiscan.io/tx/0x4e6e72c1236aafcfabbf647861f14c252bfa44e35e3a471f24edb75848f5eeeb) |
| ERC4626Adapter | Arbitrum One | `0x912c690f95a381e72F63a378fd906C6294412Fc9` | [0x71f3fce1…](https://arbiscan.io/tx/0x71f3fce16ef4a90a495075f010a9c8761260e8a38a5a152581a1fc684956bdc1) |
| AaveV3Adapter | Arbitrum One | `0x55da7c3B5e99816A7a9cD9dc47e24bfd7B19D6ED` | [0x252586bb…](https://arbiscan.io/tx/0x252586bb5807b66dddce4714ee3906685233b27fec997ad7c16f30dd7ac8cf62) |
| InletExit | Arbitrum One | `0x49de71C101F1768C1ad4132AB815C163608A86d9` | [0x2567cd8d…](https://arbiscan.io/tx/0x2567cd8d17fd91a135d21a7654c6d69374f51dddf60f4bfdb974c6db46f0d1f4) |
| ERC4626ExitAdapter | Arbitrum One | `0x3f2Fea5C6dE03b4A2B3771321E5545314B1f4E26` | [0x4a722e48…](https://arbiscan.io/tx/0x4a722e48cfb38fbdab476f05cd0ced8a516778094c755154bb3ca689ee345cc8) |
| AaveV3ExitAdapter | Arbitrum One | `0x9eD3b40bFd249Eb133Ae10b0006afae5d5947736` | [0x3bcf998f…](https://arbiscan.io/tx/0x3bcf998f9eb414c94d9a9f106531a9ff57b7f44d173a2bb48f96a24ded129613) |
| CompoundV3ExitAdapter | Arbitrum One | `0x66eE772967c04A03C23466d4497a968b982f369e` | [0xc1b721ea…](https://arbiscan.io/tx/0xc1b721eaccc033829ffec5e0c52e279751e0bab5bb45330fbec873283159a996) |

The hub routes domain 3 to the receiver as an EVM destination with no forwarder and a maximum fee of 0 bps, set in [0xf61e0b93…](https://explorer.arc.io/tx/0xf61e0b93d3e2a138ea4c3cbce53bbdf2cfdf6977d6feb1d2fcffb390dfe1839a) (`setDestination`) and [0x14fa68a3…](https://explorer.arc.io/tx/0x14fa68a3bcb0187c86bd947ef5586726199209af3e8984c390c47f51e6937046) (`setReceiver`).

The hub and the receiver share an address. Each was the deployer's first transaction on its chain, so plain `CREATE` from nonce zero gave the same result on both. They are different contracts on different chains and nothing reads one for the other. Deterministic deployment through the CREATE2 proxy, described in section 5, was not done for this push.

The one preset, `aave-v3-arbitrum`, supplies to the Aave V3 pool `0x794a61358D6845594F94dc1DB02A252b5b4814aD` and the depositor receives aArbUSDCn `0x724dc807b04555b71ed48a6896b6F41593b8C637`.

---

## 2. Arc mainnet, verified 2026-10-11

| Fact | Value |
|---|---|
| Chain id | 5042 |
| RPC | `https://rpc.mainnet.arc.io` |
| Explorer | `https://explorer.arc.io`, Blockscout behind Cloudflare |
| Gas token | USDC. The native balance has 18 decimals, the ERC 20 view at `0x3600000000000000000000000000000000000000` has 6. |
| Gas price floor | 20 gwei. A transaction priced below it is dropped without an error, so the Arc scripts run with `--with-gas-price 30gwei --priority-gas-price 1gwei`. |
| CCTP domain | 26, confirmed by `localDomain()` on the MessageTransmitter |
| TokenMessengerV2 | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`, the same on Arbitrum One |
| MessageTransmitterV2 | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64`, the same on Arbitrum One |
| CREATE2 proxy | `0x4e59b44847b379578588920cA78FbF26c0B4956C`, present |
| Gateway | Live on Arc mainnet, GatewayWallet `0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE` and GatewayMinter `0x2222222d7164433c4C09B0b0D809a9b52C04C205`. Switched off in Inlet's mainnet config, which carries the zero address for both, so mainnet runs CCTP only. |
| Circle fees | Arbitrum One to Arc: 0.35 bps for a fast transfer, 0 at standard finality. Arc to Arbitrum One: 0 at both. Iris for mainnet is `https://iris-api.circle.com`, Gateway `https://gateway-api.circle.com`. |

Arbitrum One: chain id 42161, domain 3, USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, gas around 0.02 gwei.

---

## 3. How the deployment ran, 2026-10-12

Three keys: the deployer, the relayer `0xc39c49908CF5C64239a5B4Fde4ddC14dD9D64cb3`, and a test wallet `0xFDeA5eBbe7970A00792562e1C5299215CF6A3813` that pays for the proof runs. All three were funded on Arbitrum One only. Nothing held USDC on Arc.

**Gas on Arc.** A wallet with no USDC on Arc cannot call `receiveMessage` for its own mint, so the two seeds went through Circle's forwarding service: `depositForBurnWithHook` on Arbitrum One with the hook data `0x636374702d666f7277617264` followed by zeros to 32 bytes, a maximum fee of 30000 units, fast finality and a zero destination caller. Circle attested and submitted the mint on Arc itself and kept the fee, so 1.03 USDC arrived as exactly 1 USDC for the deployer (burn [0xaecba22d…](https://arbiscan.io/tx/0xaecba22debfb3e4f7be1c168a0fd9e79ab9ce45b6c54c38d983fb106a05eb075), mint on Arc [0x0fe3b72c…](https://explorer.arc.io/tx/0x0fe3b72c4f8592c027b691825c7347a956624cf11af284556ef98649382a32e8)) and 2.03 as 2 USDC for the relayer (burn [0x7fec6efc…](https://arbiscan.io/tx/0x7fec6efc0f3d32ee88f8b9f74b8556d62d6496c8b4c7d84d8826ccdc03a21b36), mint on Arc [0xaf4492c2…](https://explorer.arc.io/tx/0xaf4492c2b22e1bb0897b2ffc0cbfb6e59503b63dfc515a6108b820368597e767)). Each took about a minute.

**The scripts, in order.**

1. `DeployHub` on Arc with `USDC=0x3600000000000000000000000000000000000000`, `TOKEN_MESSENGER=0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` and `LOCAL_DOMAIN=26`. 1999679 gas at 21 gwei, about 0.04 USDC.
2. `DeployReceiver` on Arbitrum One with `USDC`, `MESSAGE_TRANSMITTER`, `HUB`, `HUB_DOMAIN=26` and `DEPLOY_DEMO_VAULT=false`. It deploys and registers the ERC 4626 adapter as well.
3. `DeployAdapter` with `NAME=aave-v3` and `RECEIVER`.
4. `DeployExit` with `USDC` and `TOKEN_MESSENGER`. It deploys the InletExit and the three exit adapters and registers them.
5. `ConfigureHub` on Arc with `HUB`, `DOMAIN=3`, `KIND=1`, `RECEIVER` as the receiver left padded to 32 bytes and `MAX_FEE_BPS=0`.

The eight Arbitrum One transactions cost about 0.0001 ETH together. `OWNER` was left unset everywhere, so the deployer owns everything.

**Record and regenerate.** The addresses went into `config/deployments.mainnet.json`, `pnpm generate` in `packages/sdk` rebuilt the generated catalog, and the destination `aave-v3-arbitrum` appeared in `mainnetDestinations` with its exit entry, because the mainnet catalog builds from the deployment file.

**Proof run.** `NETWORK=mainnet pnpm e2e` in `services/relayer` with the test wallet starts a local mainnet relayer and deposits 1 USDC from Arbitrum One into Aave V3 on Arbitrum One through the hub: burn [0xef19a212…](https://arbiscan.io/tx/0xef19a21292c7a71820d935af66f57362236dc41f7f31714e8baa3b681a01f741), Arc mint [0x3f1826da…](https://explorer.arc.io/tx/0x3f1826da0b001f1f1e3ec842e99fc9b46c9e2439947321ac23996c6834c75df5), sweep [0x6fa83289…](https://explorer.arc.io/tx/0x6fa832898dfe3e75249f435fa7f3ac7ab5a8e57d9c81329b7a53958c4b363528), execute [0x68cd4835…](https://arbiscan.io/tx/0x68cd4835bafb82867b8568dbc44b6d69d56da03991f6a774272a72d86bb0f37b), 999964 aArbUSDCn delivered in 33 seconds. The row is in `services/relayer/README.md`.

---

## 4. Running the services on mainnet

The relayer takes `NETWORK=mainnet`, `ARC_RPC`, `ARBITRUM_RPC` and `RELAYER_PRIVATE_KEY`. It refuses to start on mainnet while `config/deployments.mainnet.json` has no hub, and it serves only the chains that have a receiver there. The hosted mainnet relayer is its own container app from the azd environment `inlet-mainnet` in resource group `inlet-mainnet`, with `NETWORK=mainnet`, `RELAYER_NAME=inlet-relayer-mainnet` and a CORS list of the production site, so the testnet relayer in resource group `inlet` keeps serving the `testnet` branch. The site reads `NEXT_PUBLIC_NETWORK`, `mainnet` on the Vercel production environment and unset on the `testnet` branch, and `NEXT_PUBLIC_RELAYER_URL` points each at its relayer. The widget takes `network` on `InletProvider` and the MCP server reads `INLET_NETWORK`.

The relayer needs USDC on Arc for sweeps and refunds, about 0.006 USDC per sweep at the floor price, and ETH on Arbitrum One for `receiveAndExecute` and for exit executions.

---

## 5. The remaining chains

Ethereum, Base and Unichain join as configuration. Circle's addresses for them, from Circle's documentation on 2026-09-10:

| Chain | Chain id | CCTP domain | USDC |
|---|---|---|---|
| Ethereum | 1 | 0 | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base | 8453 | 6 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Unichain | 130 | 10 | `0x078D782b760474a361dDA0AF3839290b0EF57AD6` |

TokenMessengerV2 and MessageTransmitterV2 keep the addresses above on each of them. Per chain: add the entry to `config/chains.mainnet.json`, run `DeployReceiver`, `DeployAdapter` for what the chain carries (Compound III on Base, Uniswap v4 on Unichain with `POSITION_MANAGER`, `STATE_VIEW`, `PERMIT2` and `USDC`), `DeployExit`, then `ConfigureHub` on Arc, record the addresses, add the catalog entry to `mainnetCatalog` in `packages/sdk/src/destinations.ts`, regenerate, and give the relayer the chain's RPC variable, which is the config key in capitals plus `_RPC`. Ethereum is the expensive one and is budgeted separately.

Deterministic addresses through the CREATE2 proxy at `0x4e59b44847b379578588920cA78FbF26c0B4956C` remain the follow up: one `{salt: SALT}` per `new` in the scripts, with `SALT` read from the environment, makes every address reproducible from the repository. Same code, same salt and same constructor arguments give the same address on any chain.

---

## 6. Risks that remain

| Risk | Mitigation |
|---|---|
| Public RPCs return stale nonces or lag on reads | Paid endpoints through `ARC_RPC` and `ARBITRUM_RPC`. The relayer manages nonces locally and retries nonce errors. |
| The owner is a single key | The hub, the receiver and the exit take an owner argument, so a multisig is a deployment or `transferOwnership` decision, not a migration. |
| A sweep priced below Arc's floor is dropped silently | The relayer prices from the node, which reports the floor. Scripts pass the gas price explicitly. |
| Not audited | Zero fees and small amounts for now. |

---

## 7. The summary for the submission

Inlet's mainnet path was configuration, not construction. The hub, the receiver, the adapters, the exit rail and its three exit adapters take every network specific value as a constructor argument or a script variable, the relayer derives its chains from the config file, and the same scripts that produced the testnet deployment produced the mainnet one in a single sitting on 2026-10-12. One USDC made the trip from Arbitrum One through Arc into an Aave V3 position in 33 seconds on the first attempt.
