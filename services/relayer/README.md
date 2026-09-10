# Inlet relayer

The service that completes deposits. It watches deposit addresses on Arc, mints incoming CCTP transfers, sweeps the hub, waits for Circle's attestation, and executes the adapter on the destination chain. Every step checks the chain before acting, so the process can restart at any point.

```
pnpm install
cp .env.example .env
pnpm dev
```

`RELAYER_PRIVATE_KEY` pays gas on Arc (USDC) and on the destination chains. State lives in a SQLite file at `DB_PATH`. Destination chains and receivers come from `config/deployments.testnet.json`; the relayer serves every chain that has a receiver there: Arbitrum Sepolia, Base Sepolia, Unichain Sepolia, Ethereum Sepolia and Monad Testnet today.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | hub and relayer addresses |
| POST | `/intents` | register an intent, returns its hash and deposit address |
| POST | `/intents/:hash/source-tx` | report the CCTP burn on the source chain |
| POST | `/intents/:hash/gateway` | submit the signed Gateway burn intent |
| GET | `/intents/:hash` | current state and transaction hashes |
| POST | `/exits` | register a signed withdrawal, returns its hash and the executor address derived from it |
| GET | `/exits/:hash` | current state, the redemption hash and the mint hash of every leg |
| GET | `/quotes/uniswap` | live quote from the Uniswap Trading API, when `UNISWAP_API_KEY` is set; query `chainId`, `tokenIn`, `tokenOut`, `amount` |

States: created, funded, swept, attested, executed, claimable, refunding, refunded, expired.

An exit is signed once the relayer has the owner's approval, executed once the position has been redeemed and burned on the position chain, attested once Circle has signed every leg, and delivered once every leg has been minted on its chain.

## End to end on testnet

`pnpm e2e` burns one USDC on the source chain, routes it through Arc, and deposits it into the chosen destination, printing every transaction hash. `pnpm gateway:deposit` funds a Gateway balance once, and `pnpm e2e:gateway` runs the same deposit from that balance without a source chain wait. Both scripts read `DESTINATION` (one of the keys in `scripts/destinations.ts`, default `demo-vault`), `SOURCE` (a CCTP domain, default 6 for Base Sepolia), `E2E_AMOUNT` in USDC units, `USER_PRIVATE_KEY` for the depositing wallet, and `RELAYER_URL` to use a hosted relayer instead of starting one.

## Recorded testnet runs

| Route | Burn or signature | Arc mint | Sweep on Arc | Execute on the destination | Time to position |
| --- | --- | --- | --- | --- | --- |
| Direct CCTP, fast transfer from Base Sepolia | 0x0c0397416083491bfda5f9dfa27fc82a11c29872749c984d4016f8a7f72ee791 | 0x19c281fec4fb9fc43bc03c71dbfe34f44c96cf657d72729bb93b09a5d642aec8 | 0x1c67f2afec36767c313e567e3210aae1b4c328dd17b8d7cef6026bcbea010859 | 0xccf3912b482c1bbb663cb011ccc34b8e980f5dfffedd5fce2b5663975221456f | 25 seconds |
| Gateway from a Base Sepolia unified balance | signed burn intent | 0x603f1db403b1ae0ca0eb93ef97206b0344053561bcaf8b4a32a749e912d63753 | 0x5bc0b1ac3827e9e2fb93ed8f7bcc6f03e5f93693f2d4dadfc92d6db38c26accc | 0x809c9c36a47fa05e0391da79c33a789abbf78befda0a9e0f0b3a3c74b077a82c | 16 seconds |
| Refund after deadline, intent funded short by the fast transfer fee | deposit address held 999870 | refund burn on Arc 0x59b19babfa135dd243a303571389b93b470f2fb1c7b139ad15e4c87f290ad483 | | mint on Base Sepolia 0x5c9b00e12edc35067c4b54ed22ac86214dece18da9702dda3daca95ce6b27959 | 6 seconds after the deadline |
| Direct CCTP from Base Sepolia into Aave V3 on Arbitrum Sepolia, 999870 aArbSepUSDC delivered | 0xddb85866a1a4ce3215b2d3cdf6bd5c4c4829e077e87f97dfaea6b29f8ea2849f | 0xecd18a65fc7b0077cb9eba7772c78ec2d6ca259292c4661374bfeca5dca2f086 | 0xa8c5afb12a3f9329e462db7d6a6bb2ec2fe5dd6eb49d4aa07c4c67c9b91b9281 | 0x871b4f1539a91b6196c346d8561f14ad088760f93c823a9cce8ef59a609d5170 | 42 seconds |
| Direct CCTP from Arbitrum Sepolia into Compound III on Base Sepolia, 999869 USDC supplied | 0x7699f680ccd74d481a328a6d8e6ee0a7d65ee3e70c61628e73ca26fd3b679032 | 0xb054d68268fd9133f014ac4a3638e273d4be6b2bdd0a7638f5238e14841c9744 | 0x685680566451287675359db680ef9ac1cdaf54d1001d936e9105e1f988f168ec | 0xaa8701105bab942c3bb64615e68ce9858728488cab5c291f37283bda1e7436f4 | 32 seconds |
| Direct CCTP from Arbitrum Sepolia into the Morpho Oneshot vault on Base Sepolia, 999866200508818015 vUSDC shares | 0x883317b730cf3d41001cd44e2f075fcec70f302ce0119a032ff3d7acc51e6d76 | 0x5214ebb0e48ce1ffaf968907fc4c24fad42e048968f80a15f03437e4814464cf | 0x477387bb2ca8c32a5dd2ba23f9fbfe629c66d1f20b8306baf322ece450d68db7 | 0x4525519e37430ff5d473b3e7af2f41e66070bf4522cad9c1d5df0dba6a47b287 | 36 seconds |
| Direct CCTP from Base Sepolia into a Uniswap v4 ETH/USDC position on Unichain Sepolia, position 7920 with liquidity 546255824825 | 0x082440c3cda81259ab7f8e636e2dc0ea5292f510655f05619dc2b251a2f238a8 | 0x6f08191e89260315621a6d0d256663381749cc730bf360a591200bba462ed2d8 | 0x1cf9832b4151ad0886029b45ea349b66b82699793373fc00c3f87591fe17ab09 | 0x9bfe59be1f352251d7f879f263ca7265634c707b1c5b11c336f89491228ca769 | 31 seconds |
| Gateway from a Base Sepolia unified balance into a Uniswap v4 position on Unichain Sepolia, hosted relayer, second position for the same wallet | signed burn intent | 0x8014c3d695499da1b24ce43c55211ae603e8987408a48aac773166f0a579efe4 | 0xa20ddc860a2da0a002242ca3342871e8d71ea383dc38a6c8f33749a901740f4e | 0x2494dca32754c6820fe12fca35e1f3842dff30a16a868bc3b1ef15bc20305b02 | 214 seconds, of which about three minutes were a stale nonce from the public Unichain Sepolia RPC and the retry backoff; the relayer now manages nonces locally and retries nonce errors after five seconds |
| Gateway from a Base Sepolia unified balance into Compound III on Base Sepolia, driven end to end by the MCP server's deposit tool against the hosted relayer | signed burn intent | 0x2180a82f73e121449b52f616883ffa71a26c44b66eaee012edad9887f37e1a31 | 0x113d8d04186c5082eb9c54dbbd87b92a733d8db03d13ecbaa0c9b6f864fe80c1 | 0xdcf11694a8160eec3413e20302a36cbb50a40ff93b7bbcc8508fcf44106e7cad | 16 seconds |
| Direct CCTP from a Privy email wallet in the widget on Base Sepolia into the demo vault on Arbitrum Sepolia, 5 USDC, 4999350 shares | 0xbaacde1567f93babee0b2295c56a8a8cbf95243824d78eead4c199aa93922905 | 0x20092205fb9d084da2885b0d078a6e88e6f55414972fa853f171420995ca100d | 0x71c3d75c0b74d5690ee3cfb18ab93cf9e1d7d329f41e3d8a9e11dba5c243edc4 | 0x01327610d541bfd4381d8d087bf0aab318c5e38e9653a37a04f0284df57cc3d5 | about 30 seconds |
| Direct CCTP from Arbitrum Sepolia into Euler's EVK vault on Ethereum Sepolia, 999867 eUSDC-4 shares | 0x859bd749b3544f2f527a9faf6eea70ff9fa1ab050f203e72215f136d636f9764 | 0xdefd3b86332166163a662819c91bbf3c60f5dc706bab706b17dcd1f6c811ac43 | 0xb5e237eb8a0aed5e7bd7cd7dcfa1b418a1f1668fd339787ededbdda670be3d05 | 0xdce4061d197ce895913138c36dda5ff73e11a0fde6d24dc147b5b2f2492c9e78 | 42 seconds |
| Direct CCTP from Arbitrum Sepolia into the Inlet demo vault on Monad Testnet, 999870 shares | 0x906aa61c1dcb4d6bf2a0c86d17ba8921e1ba29dbf78883ffe108adb85893ce4d | 0xf6e4719ad1a98b0a030cfbe2cc16de026197acd43a8d5e03d41e1c9df21c2ab7 | 0x6d53e95e78b356f35893d997fe7de139e963c370195b29600b9b8bdc0bc3d613 | 0x736aa9690101dca120f8adde22baea9066ff9306d152d1cecf7445b758f1753f | 37 seconds |

## Recorded exits

| Position | Legs | Exit hash | Redeem on the position chain | Mints | Time |
| --- | --- | --- | --- | --- | --- |
| 1 aArbSepUSDC out of Aave V3 on Arbitrum Sepolia, test wallet, local relayer | 0.5 USDC to Base Sepolia, the rest to Ethereum Sepolia | 0x985025b981f6b4727250dec664fee996738ef5aeddee455e7713a9bd1fcdf573 | 0xd71aae599f8e20fd5914d41e39b5f317853415016e1bb7a65ee0b75abc77866d, executor 0x914cc4eC6DFAE94b2f3eB9f6cE6A03D383F76bA5 | Base Sepolia 0xcc92404d8956e19729864261d506a6378ffe438f28fcfdbc069726d1ca588887 for 499935, Ethereum Sepolia 0x02a2677806a3e3bd80a7f3e6e22f5b5006b8a3d11a8aad8fc22a83c4a7d7b3c1 for 499935 | 37 seconds from the signature to both mints |
| 1 USDC of Morpho Oneshot vault shares on Base Sepolia, test wallet, hosted relayer | 0.4 USDC to Arbitrum Sepolia, the rest to Arc | 0x05eb93aaa6a0c0608d9f21a7862070b4c988550ec5885157b1e544afe34f16a8 | 0x787c8937e4e2d66cc6a1ed5d8210fc8d5de3730102a18cbd27f771725fd501f5, executor 0x2Df8c1FcED23EB755c0C8eA2B03A62D06Dd57bEf | Arbitrum Sepolia 0x5bd6e41624b4c7349bd27e342e238a958e9d806fb33f2d310631890bb950747f for 399948, Arc 0x782127e77bd83889a07e5bdcf3ac8af074b217f2b139582fac1c94cde1d3239f for 599922 | 25 seconds |
| 1 USDC of Compound III balance on Base Sepolia, test wallet, hosted relayer | 0.3 USDC to Unichain Sepolia, the rest to Ethereum Sepolia | 0xa8821d2e91e53ec1739829828809e5c5d0972d335ddf3138a50289c321d60feb | 0x3cc5dd3b7909880d9b66573e1e92d3b12af0e597dc886c0bf95513f245b53eaa, executor 0x9f42281E5f30d2bB76bF6BFF930a47645Cf7d87e | Unichain Sepolia 0x5f954b45aeb9477b2bd6fea83b1f29edd04d79c8f7f8bba4d8888d96faebb930 for 299961, Ethereum Sepolia 0x42caf6c7e25b0807ba54db9c2cbf4cb4615260a2d1b8a320ad798e042b0f932c for 699909 | 106 seconds, of which about eighty were a stale nonce from the public Unichain Sepolia RPC and the retry |
